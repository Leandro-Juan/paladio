#include "engine.hpp"

#include <algorithm>
#include <array>
#include <iostream>
#include <limits>
#include <cmath>
#include <unordered_map>
#include <bit>
#include <chrono>

namespace paladio::core {

namespace {

struct TimeoutException : public std::exception {};

/**
 * @brief Tracks the current state of the DFS traversal.
 * 
 * Designed to be lightweight and stack-allocated during the recursive search.
 * Uses a 64-bit integer bitmask to track visited nodes in O(1) time.
 */
struct SearchState {
    uint64_t visited_mask = 0;   ///< Bitmask of visited nodes by density rank.
    double current_cost = 0.0;   ///< Accumulated financial cost.
    int current_time = 0;        ///< Current elapsed time in the itinerary.
    double current_score = 0.0;  ///< Accumulated objective score.
    bool had_breakfast = false;  ///< True if a breakfast spot has been visited.
    bool had_lunch = false;      ///< True if a lunch spot has been visited.
    bool had_dinner = false;     ///< True if a dinner spot has been visited.
    int last_meal_time = -9999;  ///< Arrival time of the last meal spot visited.
    int continuous_active_time = 0; ///< Minutes spent active without a rest spot.
    std::array<uint8_t, 8> category_visits = {0}; ///< Count of visits per NodeType.
    std::array<int, 64> current_path; ///< Stack-allocated sequence of visited node indices.
    int current_path_size = 0;        ///< Current number of nodes in the path.
};

struct MemoKey {
    uint64_t mask;
    int node;
    bool operator==(const MemoKey& o) const { return mask == o.mask && node == o.node; }
};

struct MemoKeyHash {
    size_t operator()(const MemoKey& k) const {
        return std::hash<uint64_t>()(k.mask) ^ (std::hash<int>()(k.node) << 1);
    }
};

struct MemoEntry {
    uint64_t visited_mask = 0;
    int current_node = -1;
    int current_time = std::numeric_limits<int>::max();
    double current_cost = std::numeric_limits<double>::infinity();
    double current_score = -std::numeric_limits<double>::infinity();
    bool had_breakfast = false;
    bool had_lunch = false;
    bool had_dinner = false;
    int continuous_active_time = 0;
    int last_meal_time = -9999;
};

constexpr size_t TT_SIZE = 1048576; // 1M entries, limits memory to ~180MB to prevent OOM
constexpr int TT_BUCKET_SIZE = 4; // Keep small pareto frontier in bounded array

struct TTBucket {
    MemoEntry entries[TT_BUCKET_SIZE];
    int count = 0;
};

constexpr double INF = std::numeric_limits<double>::infinity();

/**
 * @brief Computes an optimistic upper bound on the remaining potential score.
 * 
 * Uses the Continuous Fractional Knapsack greedy approach as an admissible heuristic.
 * It assumes we can fractionally visit remaining unvisited POIs ordered by their
 * value-density (score/duration), ignoring travel time. If this optimistic score
 * combined with the current score is worse than the best known score, we can prune.
 * 
 * @param visited_mask The nodes already visited (to ignore them).
 * @param current_time Current elapsed time in the traversal.
 * @param end_time_limit Absolute deadline for the itinerary.
 * @param pois The list of all POIs.
 * @param sorted_pois_by_density Indices of POIs sorted descending by score/duration density.
 * @return double The maximum possible fractional score achievable in the remaining time.
 */
inline double calculate_optimistic_bound(
    uint64_t visited_mask,
    int current_time,
    int end_time_limit,
    const POI* pois,
    const int* sorted_pois_by_density,
    int min_transit_global,
    int n
) {
    int remaining_time = end_time_limit - current_time;
    if (remaining_time <= 0) return 0.0;

    double optimistic_future_score = 0.0;
    
    // Unvisited nodes mask using density rank
    uint64_t unvisited = (~visited_mask);
    if (n < 64) {
        unvisited &= ((1ULL << n) - 1);
    }
    while (unvisited) {
        int rank = std::countr_zero(unvisited);
        unvisited &= unvisited - 1; // Clear lowest set bit
        
        int i = sorted_pois_by_density[rank];
        int required_time = pois[i].duration + min_transit_global;
        
        if (current_time + required_time > pois[i].latest_time) {
            continue;
        }
        
        if (required_time <= remaining_time) {
            optimistic_future_score += pois[i].score;
            remaining_time -= required_time;
        } else {
            if (required_time > 0) {
                optimistic_future_score += pois[i].score * (static_cast<double>(remaining_time) / required_time);
            }
            break;
        }
    }
    return optimistic_future_score;
}

/**
 * @brief Core recursive Depth First Search for the Branch and Bound routing.
 * 
 * Explores the graph of POIs while strictly pruning branches that exceed constraints
 * (budget, deadlines, time windows) or that cannot possibly beat the best known score.
 * 
 * @param u The index of the current POI we are visiting.
 * @param state The current search state (mutated and reverted during recursion).
 * @param pois Vector of all available POIs.
 * @param transit_times 1D flattened N x N matrix representing travel edges.
 * @param config Global constraints for the search.
 * @param sorted_pois_by_density Pre-computed POI indices sorted for the knapsack heuristic.
 * @param best_result Reference to the global best result found so far.
 */
void dfs(
    int u,
    SearchState& state,
    const POI* pois,
    const TransitInfo* transit_times,
    const OptimizationConfig& config,
    const int* sorted_pois_by_density,
    const int* density_rank,
    int min_transit_global,
    int n,
    std::vector<TTBucket>& memo,
    uint64_t global_mandatory_mask,
    OptimizationResult& best_result,
    const std::chrono::steady_clock::time_point& start_time,
    int& node_eval_count
) {
    node_eval_count++;
    if ((node_eval_count & 1023) == 0) {
        auto now = std::chrono::steady_clock::now();
        if (std::chrono::duration_cast<std::chrono::milliseconds>(now - start_time).count() > config.timeout_ms) {
            throw TimeoutException();
        }
    }
    
    MemoKey key{state.visited_mask, u};
    size_t hash = MemoKeyHash()(key);
    auto& bucket = memo[hash % TT_SIZE];
    
    for (int i = 0; i < bucket.count; ++i) {
        const auto& m = bucket.entries[i];
        if (m.visited_mask == state.visited_mask && m.current_node == u) {
            if (state.current_time >= m.current_time &&
                state.current_cost >= m.current_cost &&
                state.current_score <= m.current_score + 1e-5 &&
                (m.had_breakfast || !state.had_breakfast) &&
                (m.had_lunch || !state.had_lunch) &&
                (m.had_dinner || !state.had_dinner) &&
                state.continuous_active_time >= m.continuous_active_time &&
                state.last_meal_time >= m.last_meal_time) {
                return; 
            }
        }
    }

    bool inserted = false;
    for (int i = 0; i < bucket.count; ++i) {
        auto& m = bucket.entries[i];
        if (m.visited_mask == state.visited_mask && m.current_node == u) {
            if (state.current_time <= m.current_time &&
                state.current_cost <= m.current_cost &&
                state.current_score >= m.current_score - 1e-5 &&
                (state.had_breakfast || !m.had_breakfast) &&
                (state.had_lunch || !m.had_lunch) &&
                (state.had_dinner || !m.had_dinner) &&
                state.continuous_active_time <= m.continuous_active_time &&
                state.last_meal_time >= m.last_meal_time) {
                
                m.current_time = state.current_time;
                m.current_cost = state.current_cost;
                m.current_score = state.current_score;
                m.had_breakfast = state.had_breakfast;
                m.had_lunch = state.had_lunch;
                m.had_dinner = state.had_dinner;
                m.continuous_active_time = state.continuous_active_time;
                m.last_meal_time = state.last_meal_time;
                inserted = true;
                break;
            }
        }
    }

    if (!inserted) {
        if (bucket.count < TT_BUCKET_SIZE) {
            auto& m = bucket.entries[bucket.count++];
            m.visited_mask = state.visited_mask;
            m.current_node = u;
            m.current_time = state.current_time;
            m.current_cost = state.current_cost;
            m.current_score = state.current_score;
            m.had_breakfast = state.had_breakfast;
            m.had_lunch = state.had_lunch;
            m.had_dinner = state.had_dinner;
            m.continuous_active_time = state.continuous_active_time;
            m.last_meal_time = state.last_meal_time;
        } else {
            int evict_idx = state.current_time % TT_BUCKET_SIZE; 
            auto& m = bucket.entries[evict_idx];
            m.visited_mask = state.visited_mask;
            m.current_node = u;
            m.current_time = state.current_time;
            m.current_cost = state.current_cost;
            m.current_score = state.current_score;
            m.had_breakfast = state.had_breakfast;
            m.had_lunch = state.had_lunch;
            m.had_dinner = state.had_dinner;
            m.continuous_active_time = state.continuous_active_time;
            m.last_meal_time = state.last_meal_time;
        }
    }

    int effective_end_time = config.end_time_limit != -1 ? config.end_time_limit : std::numeric_limits<int>::max();
    double max_possible_score = state.current_score + calculate_optimistic_bound(
        state.visited_mask, state.current_time, effective_end_time, pois, sorted_pois_by_density, min_transit_global, n
    );
    if (max_possible_score < best_result.total_score - 1e-5) {
        return; 
    }

    uint64_t unvisited_mandatory = global_mandatory_mask & ~state.visited_mask;
    if (unvisited_mandatory != 0 && config.end_time_limit != -1) {
        int required_time_for_mandatory = 0;
        uint64_t temp_mask = unvisited_mandatory;
        while (temp_mask) {
            int rank = std::countr_zero(temp_mask);
            temp_mask &= temp_mask - 1;
            int i = sorted_pois_by_density[rank];
            required_time_for_mandatory += pois[i].duration + min_transit_global;
        }
        if (state.current_time + required_time_for_mandatory > config.end_time_limit) {
            return;
        }
    }

    for (int i = 0; i < n; ++i) {
        if ((state.visited_mask & (1ULL << i)) == 0) {
            int v = sorted_pois_by_density[i];
            
            if (config.end_node_index.has_value() && v == config.end_node_index.value()) {
                continue; // Do not visit the end node in the middle of the itinerary
            }

            // Calculate temporal feasibility
            int arrival_time_before_wait = state.current_time + transit_times[u * n + v].duration;
            double transit_cost = transit_times[u * n + v].cost;
            int arrival_time = arrival_time_before_wait;
            
            if (arrival_time < pois[v].earliest_time) {
                arrival_time = pois[v].earliest_time;
            }

            int idle_time = arrival_time - arrival_time_before_wait;
            if (idle_time > config.max_idle_time) continue;

            // Prune if we would leave after the POI closes
            if (arrival_time + pois[v].duration > pois[v].latest_time) {
                continue; 
            }

            // Calculate budget feasibility (including return to base if specified)
            double next_cost = state.current_cost + transit_cost + pois[v].cost;
            if (config.end_node_index.has_value() && config.end_node_index.value() != v) {
                int target_end = config.end_node_index.value();
                double return_cost = transit_times[v * n + target_end].cost;
                int return_dur = transit_times[v * n + target_end].duration;
                
                if (next_cost + return_cost > config.max_budget) continue;
                
                int time_after_visit = arrival_time + pois[v].duration;
                if (time_after_visit + return_dur > pois[target_end].latest_time) continue;
                if (config.end_time_limit != -1 && time_after_visit + return_dur > config.end_time_limit) continue;
            } else {
                if (next_cost > config.max_budget) continue;
            }

            bool is_strict_meal = (pois[v].type == NodeType::RESTAURANT_BREAKFAST || 
                                   pois[v].type == NodeType::RESTAURANT_LUNCH || 
                                   pois[v].type == NodeType::RESTAURANT_DINNER);
            if (is_strict_meal) {
                if (arrival_time - state.last_meal_time < config.min_meal_spacing) continue;
            }

            double node_score = pois[v].score;

            int next_continuous_active_time = state.continuous_active_time;
            bool is_rest_node = (pois[v].type == NodeType::BAR || 
                                 pois[v].type == NodeType::HOTEL || 
                                 is_strict_meal);
            if (is_rest_node) {
                next_continuous_active_time = 0;
            } else {
                if (state.continuous_active_time + transit_times[u * n + v].duration > config.max_active_time_before_fatigue) {
                    node_score *= config.fatigue_penalty_multiplier;
                }
                next_continuous_active_time += transit_times[u * n + v].duration + pois[v].duration;
            }

            uint8_t category_count = state.category_visits[static_cast<size_t>(pois[v].type)];
            if (category_count >= config.monotony_threshold) {
                node_score *= std::pow(config.monotony_multiplier, category_count - config.monotony_threshold + 1);
            }

            // Apply idle penalty to the total score
            double penalty = (idle_time / 15.0) * config.idle_time_penalty_rate;
            double next_score = state.current_score + node_score - penalty;
            int next_time = arrival_time + pois[v].duration;
            
            // Determine meal constraint satisfaction
            bool is_breakfast = pois[v].is_breakfast_spot;
            bool is_lunch = pois[v].is_lunch_spot;
            bool is_dinner = pois[v].is_dinner_spot;

            bool next_had_breakfast = state.had_breakfast || is_breakfast;
            bool next_had_lunch = state.had_lunch || is_lunch;
            bool next_had_dinner = state.had_dinner || is_dinner;
            
            bool acts_as_meal = is_strict_meal || is_breakfast || is_lunch || is_dinner;
            int next_last_meal_time = acts_as_meal ? arrival_time + pois[v].duration : state.last_meal_time;

            // Prune if a meal deadline has passed and we haven't eaten that meal
            if (config.breakfast_deadline != -1 && next_time > config.breakfast_deadline && !state.had_breakfast) continue;
            if (config.lunch_deadline != -1 && next_time > config.lunch_deadline && !state.had_lunch) continue;
            if (config.dinner_deadline != -1 && next_time > config.dinner_deadline && !state.had_dinner) continue;

            uint64_t prev_mask = state.visited_mask;
            double prev_cost = state.current_cost;
            int prev_time = state.current_time;
            double prev_score = state.current_score;
            bool prev_breakfast = state.had_breakfast;
            bool prev_lunch = state.had_lunch;
            bool prev_dinner = state.had_dinner;
            int prev_last_meal_time = state.last_meal_time;
            int prev_continuous_active_time = state.continuous_active_time;

            state.visited_mask |= (1ULL << i);
            state.current_cost = next_cost;
            state.current_time = next_time;
            state.current_score = next_score;
            state.had_breakfast = next_had_breakfast;
            state.had_lunch = next_had_lunch;
            state.had_dinner = next_had_dinner;
            state.last_meal_time = next_last_meal_time;
            state.continuous_active_time = next_continuous_active_time;
            state.category_visits[static_cast<size_t>(pois[v].type)]++;
            state.current_path[state.current_path_size++] = v;

            // Recurse deeper
            dfs(v, state, pois, transit_times, config, sorted_pois_by_density, density_rank, min_transit_global, n, memo, global_mandatory_mask, best_result, start_time, node_eval_count);

            state.current_path_size--;
            state.category_visits[static_cast<size_t>(pois[v].type)]--;
            state.continuous_active_time = prev_continuous_active_time;
            state.last_meal_time = prev_last_meal_time;
            state.had_dinner = prev_dinner;
            state.had_lunch = prev_lunch;
            state.had_breakfast = prev_breakfast;
            state.current_score = prev_score;
            state.current_time = prev_time;
            state.current_cost = prev_cost;
            state.visited_mask = prev_mask;
        }
    }

    bool valid_end_node = true;
    double final_cost = state.current_cost;
    int final_time = state.current_time;
    int final_path_size = state.current_path_size;
    
    if (config.end_node_index.has_value() && state.current_path_size > 0) {
        int target_end = config.end_node_index.value();
        if (state.current_path[state.current_path_size - 1] != target_end) {
            // Calculate transit back to base
            int return_dur = transit_times[u * n + target_end].duration;
            double return_cost = transit_times[u * n + target_end].cost;
            final_time += return_dur;
            final_cost += return_cost;
            
            int idle_time = 0;
            if (final_time < pois[target_end].earliest_time) {
                idle_time = pois[target_end].earliest_time - final_time;
                final_time = pois[target_end].earliest_time;
            }
            
            if (idle_time > config.max_idle_time) valid_end_node = false;
            
            if (final_cost > config.max_budget || 
                final_time > pois[target_end].latest_time || 
                (config.end_time_limit != -1 && final_time > config.end_time_limit)) {
                valid_end_node = false;
            }
            
            // If valid, conceptually the path ends with target_end
            final_path_size++; // We will append target_end dynamically
        } else {
            if (config.end_time_limit != -1 && final_time > config.end_time_limit) {
                valid_end_node = false;
            }
        }
    } else if (config.end_time_limit != -1 && final_time > config.end_time_limit) {
        valid_end_node = false;
    }

    // Verify final node matches required type if specified
    if (config.end_node_type.has_value() && state.current_path_size > 0) {
        int tail_node = (final_path_size > state.current_path_size) ? config.end_node_index.value() : state.current_path[state.current_path_size - 1];
        valid_end_node = valid_end_node && (pois[tail_node].type == config.end_node_type.value());
    }
    
    // Ensure all mandatory meals have been consumed if deadlines are specified
    if (config.breakfast_deadline != -1 && !state.had_breakfast) valid_end_node = false;
    if (config.lunch_deadline != -1 && !state.had_lunch) valid_end_node = false;
    if (config.dinner_deadline != -1 && !state.had_dinner) valid_end_node = false;
    
    // Ensure all mandatory POIs are visited
    if ((state.visited_mask & global_mandatory_mask) != global_mandatory_mask) {
        valid_end_node = false;
    }

    if (state.current_path_size > 0 && valid_end_node) {
        bool is_better = false;
        double eps = 1e-5;
        
        // Lexicographical optimization: Maximize Score -> Minimize Time -> Minimize Cost
        if (state.current_score > best_result.total_score + eps) {
            is_better = true;
        } else if (std::abs(state.current_score - best_result.total_score) <= eps) {
            if (final_time < best_result.total_time) {
                is_better = true;
            } else if (final_time == best_result.total_time) {
                if (final_cost < best_result.total_cost) {
                    is_better = true;
                }
            }
        }

        if (is_better) {
            best_result.path.assign(state.current_path.begin(), state.current_path.begin() + state.current_path_size);
            if (final_path_size > state.current_path_size) {
                best_result.path.push_back(config.end_node_index.value());
            }
            best_result.total_cost = final_cost;
            best_result.total_time = final_time;
            best_result.total_score = state.current_score;
        }
    }
}

} // namespace

OptimizationResult optimize_itinerary(
    const std::vector<POI>& pois,
    const std::vector<TransitInfo>& transit_times,
    const OptimizationConfig& config
) {
    // 64-bit mask restricts problem size. Scaling beyond this requires a vector<bool> or big integer mask.
    if (pois.size() > 64) {
        throw std::invalid_argument("DFS engine does not support more than 64 POIs due to bitmask limits.");
    }

    OptimizationResult best_result;
    best_result.total_score = -1.0;
    best_result.total_time = INF;
    best_result.total_cost = INF;

    int n = static_cast<int>(pois.size());
    if (n == 0) return best_result;

    // Pre-compute value density array for the Fractional Knapsack Heuristic
    std::vector<int> sorted_pois_by_density(n);
    for (int i = 0; i < n; ++i) sorted_pois_by_density[i] = i;
    std::sort(sorted_pois_by_density.begin(), sorted_pois_by_density.end(), [&pois](int a, int b) {
        if (pois[a].is_mandatory != pois[b].is_mandatory) {
            return pois[a].is_mandatory > pois[b].is_mandatory;
        }
        double density_a = pois[a].duration > 0 ? pois[a].score / static_cast<double>(pois[a].duration) : INF;
        double density_b = pois[b].duration > 0 ? pois[b].score / static_cast<double>(pois[b].duration) : INF;
        return density_a > density_b; // Sort descending
    });

    std::vector<int> density_rank(n);
    for (int i = 0; i < n; ++i) {
        density_rank[sorted_pois_by_density[i]] = i;
    }

    uint64_t global_mandatory_mask = 0;
    for (int i = 0; i < n; ++i) {
        if (pois[i].is_mandatory) {
            global_mandatory_mask |= (1ULL << density_rank[i]);
        }
    }

    int min_transit_global = std::numeric_limits<int>::max();
    for (int u = 0; u < n; ++u) {
        for (int v = 0; v < n; ++v) {
            if (u != v) {
                min_transit_global = std::min(min_transit_global, transit_times[u * n + v].duration);
            }
        }
    }
    if (min_transit_global == std::numeric_limits<int>::max()) {
        min_transit_global = 0;
    }

    std::vector<TTBucket> memo(TT_SIZE);

    auto start_time = std::chrono::steady_clock::now();
    int node_eval_count = 0;

    const POI* pois_ptr = pois.data();
    const TransitInfo* transit_ptr = transit_times.data();
    const int* sorted_pois_ptr = sorted_pois_by_density.data();
    const int* density_rank_ptr = density_rank.data();

    int start_idx = config.start_node_index.value_or(-1);
    
    // Iterate over valid starting nodes
    for (int start_node = 0; start_node < n; ++start_node) {
        if (start_idx != -1 && start_node != start_idx) continue;

        // Ensure the POI can be visited before it closes
        if (pois[start_node].earliest_time + pois[start_node].duration > pois[start_node].latest_time) {
            continue;
        }

        double start_cost = pois[start_node].cost;
        if (start_cost > config.max_budget) continue;

        // Initialize root state for DFS
        SearchState state;
        state.visited_mask = (1ULL << density_rank[start_node]);
        state.current_cost = start_cost;
        state.current_time = pois[start_node].earliest_time + pois[start_node].duration;
        state.current_score = pois[start_node].score;
        
        state.had_breakfast = pois[start_node].is_breakfast_spot;
        state.had_lunch = pois[start_node].is_lunch_spot;
        state.had_dinner = pois[start_node].is_dinner_spot;
        state.current_path[state.current_path_size++] = start_node;

        bool is_strict_meal = (pois[start_node].type == NodeType::RESTAURANT_BREAKFAST || 
                               pois[start_node].type == NodeType::RESTAURANT_LUNCH || 
                               pois[start_node].type == NodeType::RESTAURANT_DINNER);
        if (is_strict_meal) {
            state.last_meal_time = state.current_time;
            state.continuous_active_time = 0;
        } else if (pois[start_node].type == NodeType::BAR || pois[start_node].type == NodeType::HOTEL) {
            state.continuous_active_time = 0;
        } else {
            state.continuous_active_time = pois[start_node].duration;
        }
        state.category_visits[static_cast<size_t>(pois[start_node].type)] = 1;

        // Immediate pruning if a meal deadline is blown on the first node
        if (config.breakfast_deadline != -1 && state.current_time > config.breakfast_deadline && !state.had_breakfast) continue;
        if (config.lunch_deadline != -1 && state.current_time > config.lunch_deadline && !state.had_lunch) continue;
        if (config.dinner_deadline != -1 && state.current_time > config.dinner_deadline && !state.had_dinner) continue;

        try {
            // Begin recursive search from this starting node
            dfs(start_node, state, pois_ptr, transit_ptr, config, sorted_pois_ptr, density_rank_ptr, min_transit_global, n, memo, global_mandatory_mask, best_result, start_time, node_eval_count);
        } catch (const TimeoutException&) {
            break; // Time is up, stop exploring starting nodes
        }
    }

    // If no valid path was found, zero out the infinite values
    if (best_result.total_score == -1.0) {
        best_result.total_cost = 0.0;
        best_result.total_score = 0.0;
        best_result.total_time = 0.0;
    }

    return best_result;
}

} // namespace paladio::core

