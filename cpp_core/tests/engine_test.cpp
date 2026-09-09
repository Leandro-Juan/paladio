#include "engine.hpp"
#include <algorithm>
#include <gtest/gtest.h>

using namespace paladio::core;

class ItineraryEngineTest : public ::testing::Test {
protected:
  void SetUp() override {
    // Arrange default base graph
    pois = {
        {NodeType::HOTEL, 10.0, 50.0, 0, 100, 10},          // Node 0
        {NodeType::ATTRACTION, 20.0, 100.0, 10, 100, 20},   // Node 1
        {NodeType::ATTRACTION, 15.0, 80.0, 30, 120, 15},    // Node 2
        {NodeType::RESTAURANT_LUNCH, 5.0, 60.0, 20, 80, 30} // Node 3 (Lunch)
    };

    transit_times = {{0, 0.0},   {5, 2.0},  {20, 10.0}, {5, 2.0},
                     {5, 2.0},   {0, 0.0},  {15, 8.0},  {10, 5.0},
                     {20, 10.0}, {15, 8.0}, {0, 0.0},   {25, 12.0},
                     {5, 2.0},   {10, 5.0}, {25, 12.0}, {0, 0.0}};

    config.max_budget = 100.0;
  }

  std::vector<POI> pois;
  std::vector<TransitInfo> transit_times;
  OptimizationConfig config;
};

TEST_F(ItineraryEngineTest, SolvesBasicItinerary) {
  // Act
  auto result = optimize_itinerary(pois, transit_times, config);

  // Assert
  EXPECT_GT(result.path.size(), 0);
  EXPECT_LE(result.total_cost, 100.0);
}

TEST_F(ItineraryEngineTest, StrictPruningOverBudget) {
  // Arrange
  config.max_budget = 12.0;

  // Act
  auto result = optimize_itinerary(pois, transit_times, config);

  // Assert
  EXPECT_EQ(result.path.size(), 1);
  EXPECT_EQ(result.path[0], 3);
  EXPECT_DOUBLE_EQ(result.total_cost, 5.0);
}

TEST_F(ItineraryEngineTest, ThrowsInvalidArgForMoreThan64Nodes) {
  // Arrange
  std::vector<POI> large_pois(65);
  std::vector<TransitInfo> large_transit(65 * 65);

  // Act & Assert
  EXPECT_THROW(
      {
        auto _res = optimize_itinerary(large_pois, large_transit, config);
        (void)_res;
      },
      std::invalid_argument);
}

TEST_F(ItineraryEngineTest, ExcludesPOIsOutsideTimeWindows) {
  // Arrange
  pois[2].latest_time = 35;

  // Act
  auto result = optimize_itinerary(pois, transit_times, config);

  // Assert
  for (int node : result.path) {
    EXPECT_NE(node, 2);
  }
}

TEST_F(ItineraryEngineTest, PrefersHotelForMealsIfConfigured) {
  // Arrange
  pois[0].is_breakfast_spot = true;
  config.breakfast_deadline = 60;

  // Act
  auto result = optimize_itinerary(pois, transit_times, config);

  // Assert
  auto it = std::find(result.path.begin(), result.path.end(), 0);
  EXPECT_NE(it, result.path.end());
  EXPECT_GT(result.total_score, 0.0);
}

TEST_F(ItineraryEngineTest, ComputesTotalTimeIncludingReturnToStart) {
  // Arrange
  std::vector<POI> custom_pois = {
      {NodeType::HOTEL, 0.0, 0.0, 0, 3000, 1000},    // Base: dur 1000
      {NodeType::ATTRACTION, 0.0, 10.0, 0, 3000, 30} // Attraction: dur 30
  };
  std::vector<TransitInfo> custom_transit = {
      {0, 0.0}, {10, 0.0}, {10, 0.0}, {0, 0.0}};
  config.max_budget = 100.0;
  config.end_node_index = 0;
  config.start_node_index = 0;
  config.end_time_limit = 3000;

  // Act
  auto result = optimize_itinerary(custom_pois, custom_transit, config);

  // Assert
  ASSERT_EQ(result.path.size(), 3);
  EXPECT_EQ(result.path[0], 0);
  EXPECT_EQ(result.path[1], 1);
  EXPECT_EQ(result.path[2], 0);
  EXPECT_DOUBLE_EQ(result.total_time, 50.0);
}

TEST_F(ItineraryEngineTest, TieBreakerLogic) {
  // Arrange
  std::vector<POI> custom_pois = {
      {NodeType::ATTRACTION, 10.0, 50.0, 0, 100, 15}, // time=15, cost=10
      {NodeType::ATTRACTION, 15.0, 50.0, 0, 100, 5},  // time=5,  cost=15
  };
  std::vector<TransitInfo> custom_transit = {
      {0, 0.0}, {100, 100.0}, {100, 100.0}, {0, 0.0}};
  config.max_budget = 100.0;

  // Act
  auto result = optimize_itinerary(custom_pois, custom_transit, config);

  // Assert
  EXPECT_EQ(result.path.size(), 1);
  EXPECT_EQ(result.path[0], 1); // Should prefer faster time (5 < 15)
}

TEST_F(ItineraryEngineTest, ThreeMealsDayScenario) {
  // Arrange
  std::vector<POI> custom_pois = {
      {NodeType::HOTEL, 0.0, 10.0, 0, 1440, 10},
      {NodeType::ATTRACTION, 0.0, 50.0, 0, 1440, 120},
      {NodeType::RESTAURANT_BREAKFAST, 0.0, 20.0, 0, 1440, 30},
      {NodeType::RESTAURANT_LUNCH, 0.0, 20.0, 0, 1440, 60},
      {NodeType::RESTAURANT_DINNER, 0.0, 20.0, 0, 1440, 60}};

  std::vector<TransitInfo> custom_transit(25, {0, 0.0});

  config.max_budget = 1000.0;
  config.start_node_index = 0;
  config.end_node_index = 0;
  config.breakfast_deadline = 200;
  config.lunch_deadline = 600;
  config.dinner_deadline = 1000;
  config.min_meal_spacing = 0;

  custom_pois[3].earliest_time = 250;
  custom_pois[4].earliest_time = 700;
  config.max_idle_time = 1440;

  // Act
  auto result = optimize_itinerary(custom_pois, custom_transit, config);

  // Assert
  ASSERT_GT(result.path.size(), 4);

  auto has_b =
      std::find(result.path.begin(), result.path.end(), 2) != result.path.end();
  auto has_l =
      std::find(result.path.begin(), result.path.end(), 3) != result.path.end();
  auto has_d =
      std::find(result.path.begin(), result.path.end(), 4) != result.path.end();

  EXPECT_TRUE(has_b);
  EXPECT_TRUE(has_l);
  EXPECT_TRUE(has_d);
}

TEST_F(ItineraryEngineTest, ExternalMealInputOnAttraction) {
  // Arrange
  std::vector<POI> custom_pois = {
      {NodeType::HOTEL, 0.0, 10.0, 0, 1440, 10},      // 0
      {NodeType::ATTRACTION, 0.0, 50.0, 0, 1440, 120} // 1
  };
  custom_pois[1].is_dinner_spot = true;

  std::vector<TransitInfo> custom_transit(4, {0, 0.0});

  config.max_budget = 1000.0;
  config.dinner_deadline = 1000;

  // Act
  auto result = optimize_itinerary(custom_pois, custom_transit, config);

  // Assert
  ASSERT_GT(result.path.size(), 0);
  auto has_d =
      std::find(result.path.begin(), result.path.end(), 1) != result.path.end();
  EXPECT_TRUE(has_d);
}

TEST_F(ItineraryEngineTest, MandatoryPOIsEnforced) {
  // Arrange
  std::vector<POI> custom_pois = {
      {NodeType::HOTEL, 0.0, 10.0, 0, 1440, 10},              // 0
      {NodeType::ATTRACTION, 0.0, 50.0, 0, 1440, 120, false}, // 1
      {NodeType::ATTRACTION, 0.0, 5.0, 0, 1440, 120,
       true} // 2 (Mandatory but low score)
  };

  std::vector<TransitInfo> custom_transit(9, {0, 0.0});
  config.max_budget = 1000.0;

  // Act
  auto result = optimize_itinerary(custom_pois, custom_transit, config);

  // Assert
  ASSERT_GT(result.path.size(), 0);
  auto has_mandatory =
      std::find(result.path.begin(), result.path.end(), 2) != result.path.end();
  EXPECT_TRUE(has_mandatory);
}
