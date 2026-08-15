#ifndef PALADIO_CORE_ENGINE_HPP
#define PALADIO_CORE_ENGINE_HPP

#include <vector>
#include <cstdint>
#include <limits>
#include <concepts>
#include <stdexcept>
#include <optional>

namespace paladio::core {

enum class NodeType : uint8_t {
    ATTRACTION,
    HOTEL,
    AIRPORT
};

struct POI {
    NodeType type;
    double cost;
    double score;
    int earliest_time;
    int latest_time;
    int duration;
};

struct TransitInfo {
    int duration;
    double cost;
};

struct OptimizationConfig {
    double alpha;
    double beta;
    double gamma;
    double max_budget;
    std::optional<int> start_node_index;
    std::optional<NodeType> end_node_type;
};

struct OptimizationResult {
    std::vector<int> path;
    double total_cost;
    double total_time;
    double total_score;
    double objective_value;
};

// Main entry point for the C++ optimization engine
[[nodiscard]] OptimizationResult optimize_itinerary(
    const std::vector<POI>& pois,
    const std::vector<std::vector<TransitInfo>>& transit_times,
    const OptimizationConfig& config
);

} // namespace paladio::core

#endif // PALADIO_CORE_ENGINE_HPP
