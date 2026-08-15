#include "engine.hpp"

#include <algorithm>
#include <iostream>
#include <limits>

namespace paladio::core {

namespace {

constexpr double INF = std::numeric_limits<double>::infinity();

void dfs(
    int u,
    uint32_t visited_mask,
    double current_cost,
    int current_time,
    double current_score,
    std::vector<int>& current_path,
    const std::vector<POI>& pois,
    const std::vector<std::vector<TransitInfo>>& transit_times,
    const OptimizationConfig& config,
    OptimizationResult& best_result
) {
    // 1. Budget checking
    if (current_cost > config.max_budget * 1.05) {
        return; // strictly prune if > 5% over max budget
    }

    double cost_penalty = 0.0;
    if (current_cost > config.max_budget) {
        // Severely penalize branches that exceed max_budget but are within 5%
        cost_penalty = (current_cost - config.max_budget) * 1000.0;
    }

    // 2. Evaluate current path
    double current_f = config.alpha * current_cost + config.beta * current_time - config.gamma * current_score + cost_penalty;

    // We consider any path with at least 1 node as a candidate
    bool valid_end_node = true;
    if (config.end_node_type.has_value() && current_path.size() > 0) {
        valid_end_node = (pois[current_path.back()].type == config.end_node_type.value());
    }

    if (current_path.size() > 0 && valid_end_node && current_f < best_result.objective_value) {
        best_result.objective_value = current_f;
        best_result.path = current_path;
        best_result.total_cost = current_cost;
        best_result.total_time = current_time;
        best_result.total_score = current_score;
    }

    // 3. Expand to next nodes
    int n = static_cast<int>(pois.size());
    for (int v = 0; v < n; ++v) {
        if ((visited_mask & (1U << v)) == 0) {
            int arrival_time = current_time + transit_times[u][v].duration;
            double transit_cost = transit_times[u][v].cost;
            
            // Wait if we arrive before the earliest time
            if (arrival_time < pois[v].earliest_time) {
                arrival_time = pois[v].earliest_time;
            }

            // Time window pruning
            if (arrival_time > pois[v].latest_time) {
                continue; // Cannot visit v, it's closed
            }

            // Valid extension, compute new state
            double next_cost = current_cost + transit_cost + pois[v].cost;
            int next_time = arrival_time + pois[v].duration;
            double next_score = current_score + pois[v].score;
            
            current_path.push_back(v);
            dfs(v, visited_mask | (1U << v), next_cost, next_time, next_score, 
                current_path, pois, transit_times, config, best_result);
            current_path.pop_back();
        }
    }
}

} // namespace

OptimizationResult optimize_itinerary(
    const std::vector<POI>& pois,
    const std::vector<std::vector<TransitInfo>>& transit_times,
    const OptimizationConfig& config
) {
    OptimizationResult best_result;
    best_result.objective_value = INF;

    int n = static_cast<int>(pois.size());
    if (n == 0) return best_result;

    // Start DFS from each node as the potential first node
    int start_idx = config.start_node_index.value_or(-1);
    for (int start_node = 0; start_node < n; ++start_node) {
        if (start_idx != -1 && start_node != start_idx) continue;

        // If the node intrinsically cannot be visited (earliest > latest), skip it
        if (pois[start_node].earliest_time > pois[start_node].latest_time) {
            continue;
        }

        std::vector<int> path = {start_node};
        
        int start_time = pois[start_node].earliest_time + pois[start_node].duration;
        double start_cost = pois[start_node].cost;
        double start_score = pois[start_node].score;

        dfs(start_node, (1U << start_node), start_cost, start_time, start_score, 
            path, pois, transit_times, config, best_result);
    }

    // If no path was found better than INF, we just return empty
    if (best_result.objective_value == INF) {
        best_result.objective_value = 0.0;
        best_result.total_cost = 0.0;
        best_result.total_score = 0.0;
        best_result.total_time = 0.0;
    }

    return best_result;
}

} // namespace paladio::core

#ifndef PALADIO_TESTING

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

namespace py = pybind11;

PYBIND11_MODULE(paladio_core, m) {
    m.doc() = "Paladio Continuous Travel Optimization C++ Core";
    
    py::enum_<paladio::core::NodeType>(m, "NodeType")
        .value("ATTRACTION", paladio::core::NodeType::ATTRACTION)
        .value("HOTEL", paladio::core::NodeType::HOTEL)
        .value("AIRPORT", paladio::core::NodeType::AIRPORT)
        .export_values();

    py::class_<paladio::core::TransitInfo>(m, "TransitInfo")
        .def(py::init<int, double>())
        .def_readwrite("duration", &paladio::core::TransitInfo::duration)
        .def_readwrite("cost", &paladio::core::TransitInfo::cost);
    
    py::class_<paladio::core::POI>(m, "POI")
        .def(py::init<paladio::core::NodeType, double, double, int, int, int>())
        .def_readwrite("type", &paladio::core::POI::type)
        .def_readwrite("cost", &paladio::core::POI::cost)
        .def_readwrite("score", &paladio::core::POI::score)
        .def_readwrite("earliest_time", &paladio::core::POI::earliest_time)
        .def_readwrite("latest_time", &paladio::core::POI::latest_time)
        .def_readwrite("duration", &paladio::core::POI::duration);

    py::class_<paladio::core::OptimizationConfig>(m, "OptimizationConfig")
        .def(py::init<double, double, double, double, std::optional<int>, std::optional<paladio::core::NodeType>>(),
             py::arg("alpha"), py::arg("beta"), py::arg("gamma"), py::arg("max_budget"),
             py::arg("start_node_index") = std::nullopt, py::arg("end_node_type") = std::nullopt)
        .def_readwrite("alpha", &paladio::core::OptimizationConfig::alpha)
        .def_readwrite("beta", &paladio::core::OptimizationConfig::beta)
        .def_readwrite("gamma", &paladio::core::OptimizationConfig::gamma)
        .def_readwrite("max_budget", &paladio::core::OptimizationConfig::max_budget)
        .def_readwrite("start_node_index", &paladio::core::OptimizationConfig::start_node_index)
        .def_readwrite("end_node_type", &paladio::core::OptimizationConfig::end_node_type);

    py::class_<paladio::core::OptimizationResult>(m, "OptimizationResult")
        .def_readwrite("path", &paladio::core::OptimizationResult::path)
        .def_readwrite("total_cost", &paladio::core::OptimizationResult::total_cost)
        .def_readwrite("total_time", &paladio::core::OptimizationResult::total_time)
        .def_readwrite("total_score", &paladio::core::OptimizationResult::total_score)
        .def_readwrite("objective_value", &paladio::core::OptimizationResult::objective_value);

    m.def("optimize_itinerary", [](const std::vector<paladio::core::POI>& pois,
                                   const std::vector<std::vector<paladio::core::TransitInfo>>& transit_times,
                                   const paladio::core::OptimizationConfig& config) {
        // Release GIL for the core C++ loop
        py::gil_scoped_release release;
        return paladio::core::optimize_itinerary(pois, transit_times, config);
    }, "Optimize travel constraints (TSPTW + Knapsack)");
}

#endif // PALADIO_TESTING
