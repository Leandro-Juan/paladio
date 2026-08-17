---
name: cpp-unit-testing
description: Automates unit test creation for C++ projects using GoogleTest (GTest) framework with consistent software testing patterns including In-Got-Want, Table-Driven Testing, and AAA patterns. Use when creating, modifying, or reviewing unit tests, or when the user mentions unit tests, test coverage, or GTest.
metadata:
  version: "1.1.0"
  domain: testing
  triggers: unit test, gtest, googletest, create test, add test, write test, test coverage, testing
  languages: ["cpp", "c", "c++"]
---

# C++ Unit Testing (GoogleTest)

Instructions for automating unit test creation using consistent software testing patterns in C++ projects with GoogleTest.

## Benefits
- **Readability**: Tests are self-documenting with In-Got-Want and AAA structures.
- **Consistency**: Uniform structure across tests ensures predictable test organization.
- **Scalability**: Table-driven testing minimizes boilerplate code when adding test cases.
- **Debuggability**: Scoped traces (`SCOPED_TRACE`) pinpoint failures quickly.

## Testing Principles (FIRST)
- **Fast**: Unit tests must execute quickly for rapid feedback.
- **Independent**: Tests must be self-contained and isolated.
- **Repeatable**: Deterministic results across environments.
- **Self-Validating**: Clear pass/fail assertions.
- **Timely**: Written alongside production code.

## Key Testing Patterns

### 1. In-Got-Want Pattern
- **In**: Defines input parameters/conditions.
- **Got**: Captures actual output from code under test.
- **Want**: Specifies expected output.

### 2. Table-Driven Testing
Groups multiple test cases in a concise data structure and iterates through them:
```cpp
TEST(EngineTest, CalculateBudgetPenalty) {
    struct TestCase {
        std::string label;
        struct In { double cost; double budget; } in;
        struct Want { double penalty; } want;
    };

    const std::vector<TestCase> test_cases = {
        {"within_budget", {50.0, 100.0}, {0.0}},
        {"at_threshold", {85.0, 100.0}, {25.0}},
        {"over_budget", {120.0, 100.0}, {1000.0}},
    };

    for (const auto& tc : test_cases) {
        SCOPED_TRACE(tc.label);
        auto got = compute_penalty(tc.in.cost, tc.in.budget);
        EXPECT_DOUBLE_EQ(got, tc.want.penalty);
    }
}
```

### 3. Arrange, Act, Assert (AAA)
Structure tests into three clear phases:
```cpp
TEST(EngineTest, SolveItinerary) {
    // Arrange
    OptimizerEngine engine;
    Graph graph = build_sample_graph();

    // Act
    auto result = engine.solve(graph);

    // Assert
    EXPECT_TRUE(result.is_valid);
    EXPECT_LE(result.total_cost, graph.budget);
}
```

### 4. Test Fixtures (`TEST_F`)
Reuse setup/teardown across related tests:
```cpp
class ItineraryEngineTest : public ::testing::Test {
protected:
    void SetUp() override {
        engine = std::make_unique<OptimizerEngine>();
    }

    void TearDown() override {
        engine.reset();
    }

    std::unique_ptr<OptimizerEngine> engine;
};

TEST_F(ItineraryEngineTest, HandlesEmptyGraph) {
    Graph empty_graph{};
    EXPECT_THROW(engine->solve(empty_graph), std::invalid_argument);
}
```

### 5. Boundary Value Testing
Always include boundary test cases:
- Minimum/maximum limits
- Zero/empty collections
- Extreme negative/positive values
- Precision tolerance limits (`EXPECT_NEAR`, `EXPECT_DOUBLE_EQ`)

## Test Style Guide
1. Use `EXPECT_*` instead of `ASSERT_*` when non-fatal, allowing other test cases to run.
2. Group tests by function/class under test.
3. Use `SCOPED_TRACE(tc.label)` in loops for precise error reports.
4. Clean up all resources in `TearDown()` or via RAII.
