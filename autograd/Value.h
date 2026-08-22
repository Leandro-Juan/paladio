#ifndef __VALUE_H__
#define __VALUE_H__

#include <cstdarg>
#include <cstring>
#include <memory>
#include <print>
#include <tuple>
#include <unordered_set>
#include <functional>

struct ValueNode {
    double data;
    double grad;
    bool requires_grad;
    std::string op;
    std::string label;
    std::function<void()> _backwards;
    std::vector<std::shared_ptr<ValueNode>> children;

    ValueNode(double data, std::vector<std::shared_ptr<ValueNode>> children = {}, bool requires_grad = true, std::string op = "", std::string label = "")
        : data(data), grad(0.0), requires_grad(requires_grad), op(op), label(label), _backwards([](){}), children(std::move(children)) {}
};

class Value {
private:
    std::shared_ptr<ValueNode> node;

public:
    Value(double data = 0.0) : node(std::make_shared<ValueNode>(data)) {}
    
    Value(std::shared_ptr<ValueNode> n) : node(n) {}

    double& data() { return node->data; }
    double& grad() { return node->grad; }

    double data() const { return node->data; }
    
    double grad() const { return node->grad; }

    void set_label(const std::string& label) { node->label = label; }
    
    std::string label() const { return node->label; }

    std::shared_ptr<ValueNode> get_node() const { return node; }

    Value operator+(const Value& other) const;

    Value operator-(const Value& other) const;

    Value operator-() const;

    Value operator*(const Value& other) const;

    Value operator/(const Value& other) const;

    Value& operator+=(const Value& other) { 
        *this = *this + other; 
        return *this; 
    }

    Value& operator-=(const Value& other) { 
        *this = *this - other; 
        return *this; 
    }

    Value& operator*=(const Value& other) { 
        *this = *this * other; 
        return *this; 
    }

    Value& operator/=(const Value& other) { 
        *this = *this / other; 
        return *this; 
    }
    
    bool operator==(const Value& other) const;

    bool operator!=(const Value& other) const;

    bool operator<(const Value& other) const;

    bool operator>(const Value& other) const;

    bool operator<=(const Value& other) const;

    bool operator>=(const Value& other) const;

    Value exp() const;

    Value log()const; 

    Value pow(const Value& other) const;

    Value relu() const;

    Value tanh() const;

    Value sigmoid() const;

    explicit operator double() const { return node->data; }

    void backwards();

    void zero_grad();
};

#endif
