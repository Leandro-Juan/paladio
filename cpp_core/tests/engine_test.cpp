#include "engine.hpp"
#include <gtest/gtest.h>

using namespace paladio::core;

class EngineTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Simple 4-node graph
        pois = {
            {NodeType::HOTEL,            10.0, 50.0,  0, 100, 10},  // Node 0
            {NodeType::ATTRACTION,       20.0, 100.0, 10, 100, 20}, // Node 1
            {NodeType::ATTRACTION,       15.0, 80.0,  30, 120, 15}, // Node 2
            {NodeType::RESTAURANT_LUNCH, 5.0,  60.0,  20, 80,  30}  // Node 3 (Lunch)
        };

        transit_times = {
            {0, 0.0}, {5, 2.0}, {20, 10.0}, {5, 2.0},
            {5, 2.0}, {0, 0.0}, {15, 8.0}, {10, 5.0},
            {20, 10.0}, {15, 8.0}, {0, 0.0}, {25, 12.0},
            {5, 2.0}, {10, 5.0}, {25, 12.0}, {0, 0.0}
        };

        config.max_budget = 100.0;
    }

    std::vector<POI> pois;
    std::vector<TransitInfo> transit_times;
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
    // If budget is very low, it should only pick the cheapest node (Node 3, cost 5)
    config.max_budget = 12.0; 
    auto result = optimize_itinerary(pois, transit_times, config);
    EXPECT_EQ(result.path.size(), 1);
    EXPECT_EQ(result.path[0], 3);
    EXPECT_EQ(result.total_cost, 5.0);
}

TEST_F(EngineTest, TieBreakerLogic) {
    // Setup two independent nodes with equal score but different time/cost
    std::vector<POI> custom_pois = {
        {NodeType::ATTRACTION, 10.0, 50.0, 0, 100, 15}, // Node 0: time=15, cost=10, score=50
        {NodeType::ATTRACTION, 15.0, 50.0, 0, 100, 5},  // Node 1: time=5,  cost=15, score=50
    };
    std::vector<TransitInfo> custom_transit = {
        {0, 0.0}, {100, 100.0},
        {100, 100.0}, {0, 0.0}
    };
    
    // Due to the long transit time (100) between them, a path of 1 node is forced.
    OptimizationConfig custom_config;
    custom_config.max_budget = 100.0;
    auto result = optimize_itinerary(custom_pois, custom_transit, custom_config);
    
    // Both give score 50. Time tie-breaker should favor Node 1 (time 5 < 15)
    EXPECT_EQ(result.path.size(), 1);
    EXPECT_EQ(result.path[0], 1);
}

TEST_F(EngineTest, StartNodeConstraint) {
    config.start_node_index = 1;
    auto result = optimize_itinerary(pois, transit_times, config);
    
    EXPECT_GT(result.path.size(), 0);
    EXPECT_EQ(result.path[0], 1); // Must start at Node 1
}

TEST_F(EngineTest, EndNodeTypeConstraint) {
    config.end_node_type = NodeType::HOTEL;
    auto result = optimize_itinerary(pois, transit_times, config);
    
    if (result.path.size() > 0) {
        EXPECT_EQ(pois[result.path.back()].type, NodeType::HOTEL); // Must end at Hotel
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
    // Node 2: start 30 (earliest), end 45. 
    
    // Ensure Node 2 is not in the path
    for (int node : result.path) {
        EXPECT_NE(node, 2);
    }
}

TEST_F(EngineTest, TimeWindowsRespectFix) {
    // Arrival at Node 2 is 30. Duration is 15. Finish at 45.
    // Closes at 35. It must be pruned because 45 > 35.
    pois[2].latest_time = 35; 
    
    auto result = optimize_itinerary(pois, transit_times, config);
    
    for (int node : result.path) {
        EXPECT_NE(node, 2);
    }
}

TEST_F(EngineTest, MealCompliance) {
    // Override pois for this test
    std::vector<POI> custom_pois = {
        {NodeType::ATTRACTION, 10.0, 50.0, 0, 100, 20}, // Node 0
        {NodeType::ATTRACTION, 10.0, 50.0, 0, 100, 20}, // Node 1
        {NodeType::RESTAURANT_LUNCH, 10.0, 50.0, 0, 100, 30} // Node 2 (Lunch)
    };
    std::vector<TransitInfo> custom_transit = {
        {0, 0.0}, {10, 0.0}, {10, 0.0},
        {10, 0.0}, {0, 0.0}, {10, 0.0},
        {10, 0.0}, {10, 0.0}, {0, 0.0}
    };
    
    // Lunch deadline is 30.
    OptimizationConfig custom_config;
    custom_config.max_budget = 100.0;
    custom_config.lunch_deadline = 30;
    auto result = optimize_itinerary(custom_pois, custom_transit, custom_config);
    
    // Path should include Node 2 because visiting Node 1 takes us to time 50 > deadline 30
    bool has_lunch = false;
    for (int n : result.path) {
        if (n == 2) has_lunch = true;
    }
    EXPECT_TRUE(has_lunch);
}

// ---------------------------------------------------------
// NEW TESTS: Verifying Bug Fixes and New Configurations
// ---------------------------------------------------------

TEST_F(EngineTest, HotelMealInsideWindow) {
    // Configure Node 0 (HOTEL) to act as a breakfast spot
    pois[0].is_breakfast_spot = true;
    config.breakfast_deadline = 60; // Must have breakfast by 60
    
    auto result = optimize_itinerary(pois, transit_times, config);
    
    // The hotel takes 10 mins, starts at 0. Arrival 0 is in [0, 60].
    // Path should include Node 0 (HOTEL) and satisfy the deadline.
    bool has_hotel = false;
    for (int n : result.path) {
        if (n == 0) has_hotel = true;
    }
    EXPECT_TRUE(has_hotel);
    EXPECT_GT(result.total_score, 0.0);
}



TEST_F(EngineTest, EndNodeTimePenaltyFix) {
    // Test a round-trip to node 0 (base)
    config.end_node_index = 0;
    config.start_node_index = 0;
    config.end_time_limit = 2000;
    
    // Change node 0 duration to something large to make the bug obvious
    std::vector<POI> custom_pois = {
        {NodeType::HOTEL, 0.0, 0.0, 0, 2000, 1000}, // Base: dur 1000
        {NodeType::ATTRACTION, 0.0, 10.0, 0, 2000, 30} // Attraction: dur 30
    };
    std::vector<TransitInfo> custom_transit = {
        {0, 0.0}, {10, 0.0},
        {10, 0.0}, {0, 0.0}
    };
    OptimizationConfig custom_config;
    custom_config.max_budget = 100.0;
    custom_config.end_node_index = 0;
    custom_config.start_node_index = 0;
    custom_config.end_time_limit = 2000;
    
    auto result = optimize_itinerary(custom_pois, custom_transit, custom_config);
    
    // Path: 0 -> 1 -> 0
    // Time at 0: 0 + 1000 = 1000.
    // Transit 0 -> 1: 10. Arrive at 1: 1010.
    // Time at 1: 1010 + 30 = 1040.
    // Transit 1 -> 0: 10. Arrive at 0: 1050.
    // Time at 0 (round trip back): The leaf node processing should NOT add duration (1000) again.
    // So final time should be exactly 1050.
    ASSERT_EQ(result.path.size(), 3);
    EXPECT_EQ(result.path[0], 0);
    EXPECT_EQ(result.path[1], 1);
    EXPECT_EQ(result.path[2], 0);
    EXPECT_EQ(result.total_time, 1050); 
}

TEST_F(EngineTest, ThreeMealsDayScenario) {
    // 5 nodes: Hotel(0), Attraction(1), RestaurantBreakfast(2), RestaurantLunch(3), RestaurantDinner(4)
    std::vector<POI> custom_pois = {
        {NodeType::HOTEL, 0.0, 10.0, 0, 1440, 10}, 
        {NodeType::ATTRACTION, 0.0, 50.0, 0, 1440, 120},
        {NodeType::RESTAURANT_BREAKFAST, 0.0, 20.0, 0, 1440, 30},
        {NodeType::RESTAURANT_LUNCH, 0.0, 20.0, 0, 1440, 60},
        {NodeType::RESTAURANT_DINNER, 0.0, 20.0, 0, 1440, 60}
    };
    
    // All 0 transit time to simplify
    std::vector<TransitInfo> custom_transit(25, {0, 0.0});
    
    OptimizationConfig custom_config;
    custom_config.max_budget = 1000.0;
    custom_config.start_node_index = 0;
    custom_config.end_node_index = 0;
    custom_config.breakfast_deadline = 200;
    custom_config.lunch_deadline = 600;
    custom_config.dinner_deadline = 1000;
    
    // Windows are delegated to POIs

    custom_config.min_meal_spacing = 0; // Disable spacing constraint for simplicity
    
    // Use the earliest_time to force meals into their specific windows
    custom_pois[3].earliest_time = 250; // Lunch opens at 250
    custom_pois[4].earliest_time = 700; // Dinner opens at 700
    custom_config.max_idle_time = 1440; // Allow waiting
    
    auto result = optimize_itinerary(custom_pois, custom_transit, custom_config);
    
    ASSERT_GT(result.path.size(), 4);
    
    // Check meals are all present
    bool has_b = false, has_l = false, has_d = false;
    for (int n : result.path) {
        if (n == 2) has_b = true;
        if (n == 3) has_l = true;
        if (n == 4) has_d = true;
    }
    EXPECT_TRUE(has_b);
    EXPECT_TRUE(has_l);
    EXPECT_TRUE(has_d);
}

TEST_F(EngineTest, ExternalMealInputOnAttraction) {
    // Make an attraction count as a dinner! (e.g. Dinner Cruise)
    std::vector<POI> custom_pois = {
        {NodeType::HOTEL, 0.0, 10.0, 0, 1440, 10}, // 0
        {NodeType::ATTRACTION, 0.0, 50.0, 0, 1440, 120} // 1
    };
    custom_pois[1].is_dinner_spot = true;
    
    std::vector<TransitInfo> custom_transit(4, {0, 0.0});
    
    OptimizationConfig custom_config;
    custom_config.max_budget = 1000.0;
    custom_config.dinner_deadline = 1000;
    
    auto result = optimize_itinerary(custom_pois, custom_transit, custom_config);
    
    // The attraction should satisfy the dinner deadline
    ASSERT_GT(result.path.size(), 0);
    bool has_d = false;
    for (int n : result.path) {
        if (n == 1) has_d = true;
    }
    EXPECT_TRUE(has_d);
}

TEST_F(EngineTest, DominanceCacheTolerance) {
    // Tests that floating point tolerance prevents valid branches from being falsely pruned
    std::vector<POI> custom_pois = {
        {NodeType::HOTEL, 0.0, 10.0, 0, 100, 10}, 
        {NodeType::ATTRACTION, 0.0, 50.0000001, 0, 100, 10}, // slightly higher score
        {NodeType::ATTRACTION, 0.0, 50.0, 0, 100, 10}
    };
    std::vector<TransitInfo> custom_transit(9, {0, 0.0});
    
    OptimizationConfig custom_config;
    custom_config.max_budget = 1000.0;
    
    auto result = optimize_itinerary(custom_pois, custom_transit, custom_config);
    
    // Should visit all 3 nodes and score ~110
    EXPECT_EQ(result.path.size(), 3);
    EXPECT_NEAR(result.total_score, 110.0, 0.01);
}

