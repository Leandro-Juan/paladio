---
name: cpp-mock-testing
description: Automates mock test creation for C++ projects using Google Mock (GMock) framework with consistent software testing patterns. Use when creating tests with mocked dependencies, interface mocking, behavior verification, or when the user mentions mocks, stubs, fakes, or GMock.
metadata:
  version: "1.1.0"
  domain: testing
  triggers: mock, gmock, stub, fake, mock object, test double, mocked dependency
  languages: ["cpp", "c", "c++"]
---

# C++ Mock Testing (GoogleMock)

Instructions for AI coding agents on creating mock tests using Google Mock (GMock) with consistent software testing patterns in C++ projects.

## Core Patterns
- **Mock Objects**: Simulated objects verifying interactions between the unit under test and its dependencies.
- **Interface Mocking**: Abstract interface mock implementation with `MOCK_METHOD`.
- **Behavior Verification**: Checking call counts, parameters, and invocation sequences.
- **Return Value Stubbing**: Configuring predetermined returns using `Return`, `ReturnRef`, `Throw`.

## Mock Class Template
```cpp
#include <gmock/gmock.h>
#include <gtest/gtest.h>

class MockDataProvider : public IDataProvider {
public:
    MOCK_METHOD(std::vector<Node>, fetch_nodes, (), (override));
    MOCK_METHOD(bool, save_itinerary, (const Itinerary&), (override));
    MOCK_METHOD(double, get_distance, (int from, int to), (const, override));
};
```

## Expectation Patterns

### 1. Basic Calls and Return Values
```cpp
TEST(EngineServiceTest, FetchesDataOnSolve) {
    auto mock_provider = std::make_shared<MockDataProvider>();

    EXPECT_CALL(*mock_provider, fetch_nodes())
        .Times(1)
        .WillOnce(::testing::Return(sample_nodes()));

    EngineService service(mock_provider);
    auto res = service.run();
    EXPECT_TRUE(res.success);
}
```

### 2. Parameter Matchers
```cpp
// Using built-in matchers: Eq, Ne, Gt, Lt, Ge, Le, _, NotNull
EXPECT_CALL(*mock_provider, get_distance(::testing::Ge(0), ::testing::_))
    .WillRepeatedly(::testing::Return(10.5));
```

### 3. Sequence Verification
```cpp
TEST(EngineServiceTest, ExecutionOrder) {
    auto mock = std::make_shared<::testing::StrictMock<MockDataProvider>>();

    ::testing::InSequence seq;
    EXPECT_CALL(*mock, fetch_nodes()).WillOnce(::testing::Return(sample_nodes()));
    EXPECT_CALL(*mock, save_itinerary(::testing::_)).WillOnce(::testing::Return(true));

    EngineService service(mock);
    service.run_and_save();
}
```

### 4. Exception Injection
```cpp
TEST(EngineServiceTest, HandlesProviderError) {
    auto mock = std::make_shared<MockDataProvider>();

    EXPECT_CALL(*mock, fetch_nodes())
        .WillOnce(::testing::Throw(std::runtime_error("Network timeout")));

    EngineService service(mock);
    EXPECT_THROW(service.run(), std::runtime_error);
}
```

## Mock Types
- **Default Mock**: Warns on unexpected calls.
- **NiceMock (`::testing::NiceMock<MockType>`)**: Ignores unexpected calls, best for non-critical dependencies.
- **StrictMock (`::testing::StrictMock<MockType>`)**: Fails on any un-expected call, best for strict contract verification.
