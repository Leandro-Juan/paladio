#include "engine.hpp"
#include <gtest/gtest.h>

using namespace paladio::core;

class EngineTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Simple 3-node graph
        pois = {
            {NodeType::HOTEL,      10.0, 50.0,  0, 100, 10},  // Node 0
            {NodeType::ATTRACTION, 20.0, 100.0, 10, 100, 20}, // Node 1
            {NodeType::AIRPORT,    15.0, 80.0,  30, 120, 15}  // Node 2
        };

        transit_times = {
            {{0, 0.0}, {10, 5.0}, {20, 10.0}},
            {{10, 5.0}, {0, 0.0}, {15, 8.0}},
            {{20, 10.0}, {15, 8.0}, {0, 0.0}}
        };

        config = {1.0, 1.0, 1.0, 100.0, std::nullopt, std::nullopt}; // alpha, beta, gamma, max_budget
    }

    std::vector<POI> pois;
    std::vector<std::vector<TransitInfo>> transit_times;
    OptimizationConfig config;
};

TEST_F(EngineTest, BasicOptimization) {
    auto result = optimize_itinerary(pois, transit_times, config);
    
    // We expect some valid path
    EXPECT_GT(result.path.size(), 0);
    // Budget should be respected (<= 100)
    EXPECT_LE(result.total_cost, 100.0);
}

TEST_F(EngineTest, StrictPruningOverBudget) {
    // If budget is very low, it should only pick the cheapest node (Node 0, cost 10)
    config.max_budget = 12.0; 
    
    auto result = optimize_itinerary(pois, transit_times, config);
    
    EXPECT_EQ(result.path.size(), 1);
    EXPECT_EQ(result.path[0], 0);
    EXPECT_EQ(result.total_cost, 10.0);
}

TEST_F(EngineTest, PenalizationLogic) {
    // Visiting all 3 costs 10(n0) + 5(t0->1) + 20(n1) + 8(t1->2) + 15(n2) = 58.
    // Set budget to 54. 58 > 54 * 1.05 (56.7), so it will STRICTLY prune all 3.
    config.max_budget = 54.0;
    auto result = optimize_itinerary(pois, transit_times, config);
    
    // It should NOT visit all 3.
    EXPECT_LT(result.path.size(), 3);
    
    // Set budget to 56. 58 > 56, and 56 * 1.05 = 58.8. 
    // So 58 is allowed but heavily penalized. 
    // It should prefer a 2-node path to avoid penalty, unless score is massive.
    config.max_budget = 56.0;
    config.gamma = 1.0; // Moderate score weight
    auto result2 = optimize_itinerary(pois, transit_times, config);
    
    // It should pick a 2 node path to avoid the massive penalty of 1000 * (58 - 56) = 2000
    EXPECT_LT(result2.path.size(), 3);
}

TEST_F(EngineTest, StartNodeConstraint) {
    config.start_node_index = 1;
    auto result = optimize_itinerary(pois, transit_times, config);
    
    EXPECT_GT(result.path.size(), 0);
    EXPECT_EQ(result.path[0], 1); // Must start at Node 1
}

TEST_F(EngineTest, EndNodeTypeConstraint) {
    config.end_node_type = NodeType::AIRPORT;
    auto result = optimize_itinerary(pois, transit_times, config);
    
    if (result.path.size() > 0) {
        EXPECT_EQ(pois[result.path.back()].type, NodeType::AIRPORT); // Must end at Airport
    }
}

TEST_F(EngineTest, TimeWindowsRespect) {
    // Make Node 2 close very early
    pois[2].latest_time = 25; 
    
    // Path 0 -> 1 -> 2:
    // Node 0: [0, 100], dur 10. Start 0, end 10.
    // Transit 0->1: 10. Arrive Node 1 at 20.
    // Node 1: dur 20. End 40.
    // Transit 1->2: 15. Arrive Node 2 at 55.
    // Node 2 closes at 25, so 0->1->2 is INVALID.
    
    // Path 0 -> 2 -> 1:
    // Node 0: end 10. Transit 0->2: 20. Arrive 30. 
    // Node 2 closes at 25, so INVALID.
    
    auto result = optimize_itinerary(pois, transit_times, config);
    
    // Should never have 3 nodes in the path because node 2 is impossible to reach after 0 or 1,
    // and if we start at 2, we can't reach another node easily without time accumulating.
    // Wait, start at 2: 
    // Node 2: start 30 (earliest), end 45. (wait, earliest is 30, but latest is 25?! That means Node 2 is intrinsically invalid).
    // Let's test that!
    
    // Ensure Node 2 is not in the path
    for (int node : result.path) {
        EXPECT_NE(node, 2);
    }
}
