#include "../src/engine.hpp"
#include <iostream>
#include <vector>

using namespace paladio::core;

int main() {
    std::vector<POI> pois(40, {NodeType::ATTRACTION, 0.0, 1.0, 0, 1440, 10});
    std::vector<TransitInfo> transit(40 * 40, {5, 1.0});
    pois[0].type = NodeType::HOTEL;
    pois[39].type = NodeType::HOTEL;
    
    OptimizationConfig config;
    config.start_node_index = 0;
    config.end_node_index = 39;
    config.max_budget = 5000.0;
    config.end_time_limit = 1440; // Plenty of time
    
    std::cout << "Starting optimization..." << std::endl;
    auto result = optimize_itinerary(pois, transit, config);
    std::cout << "Done! Path size: " << result.path.size() << std::endl;
    return 0;
}
