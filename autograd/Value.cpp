#include "Value.h"
#include "utils.h"
#include <algorithm>
#include <cmath>
#include <memory>
#include <vector>

Value Value::operator+(const Value& other) const {
    auto out_node = std::make_shared<ValueNode>(
        this->node->data + other.node->data,
        std::vector<std::shared_ptr<ValueNode>>{this->node, other.node},
        "+"
    );

    out_node->requires_grad = this->node->requires_grad || other.node->requires_grad;

    auto self_ptr = this->node;
    auto other_ptr = other.node;
    std::weak_ptr<ValueNode> out_weak = out_node;

    auto _backwards = [self_ptr, other_ptr, out_weak]() {
        if (auto out_ptr = out_weak.lock()) {
            if (self_ptr->requires_grad) self_ptr->grad += out_ptr->grad * 1.0;
            if (other_ptr->requires_grad) other_ptr->grad += out_ptr->grad * 1.0;
        }
    };

    out_node->_backwards = _backwards;

    return Value(out_node);
}

Value Value::operator-(const Value& other) const {
    return *this + (-other); 
}

Value Value::operator-() const {
    return *this * Value(-1.0);
}

Value Value::operator*(const Value& other) const {
    auto out_node = std::make_shared<ValueNode>(
        this->node->data * other.node->data,
        std::vector<std::shared_ptr<ValueNode>>{this->node, other.node},
        "*"
    );

    out_node->requires_grad = this->node->requires_grad || other.node->requires_grad;

    auto self_ptr = this->node;
    auto other_ptr = other.node;
    std::weak_ptr<ValueNode> out_weak = out_node;

    auto _backwards = [self_ptr, other_ptr, out_weak]() {
        if (auto out_ptr = out_weak.lock()) {
            if (self_ptr->requires_grad) self_ptr->grad += out_ptr->grad * other_ptr->data;
            if (other_ptr->requires_grad) other_ptr->grad += out_ptr->grad * self_ptr->data;
        }
    };

    out_node->_backwards = _backwards;

    return Value(out_node);
}

Value Value::operator/(const Value& other) const {
    if (other.node->data == 0.0) throw std::runtime_error("Autograd Error: Division por cero detectada durante el Forward Pass.");

    return *this * other.pow(Value(-1.0));
}

bool Value::operator==(const Value& other) const { return this->node->data == other.node->data; }

bool Value::operator!=(const Value& other) const { return this->node->data != other.node->data; }

bool Value::operator<(const Value& other) const { return this->node->data < other.node->data; }

bool Value::operator>(const Value& other) const { return this->node->data > other.node->data; }

bool Value::operator<=(const Value& other) const { return this->node->data <= other.node->data; }

bool Value::operator>=(const Value& other) const { return this->node->data >= other.node->data; }

Value Value::exp() const {
    double e = std::exp(this->node->data);

    auto out_node = std::make_shared<ValueNode>(
        e,
        std::vector<std::shared_ptr<ValueNode>>{this->node},
        "exp"
    );

    out_node->requires_grad = this->node->requires_grad;

    auto self_ptr = this->node;
    std::weak_ptr<ValueNode> out_weak = out_node;

    auto _backwards = [self_ptr, out_weak, e]() {
        if (auto out_ptr = out_weak.lock()) {
            if (self_ptr->requires_grad) self_ptr->grad += out_ptr->grad * e;
        }
    };

    out_node->_backwards = _backwards;

    return Value(out_node);
}

Value Value::log() const {
    double epsilon = 1e-8; 
    double safe_base = std::max(this->node->data, epsilon);

    auto out_node = std::make_shared<ValueNode>(
        std::log(safe_base),
        std::vector<std::shared_ptr<ValueNode>>{this->node},
        "log"
    );

    out_node->requires_grad = this->node->requires_grad;

    auto self_ptr = this->node;
    std::weak_ptr<ValueNode> out_weak = out_node;

    auto _backwards = [self_ptr, out_weak]() {
        if (auto out_ptr = out_weak.lock()) {
            if (self_ptr->requires_grad) self_ptr->grad += out_ptr->grad * (1.0 / self_ptr->data);
        }
    };

    out_node->_backwards = _backwards;

    return Value(out_node);
}

Value Value::pow(const Value& other) const {
    double e = std::pow(this->node->data, other.node->data);

    auto out_node = std::make_shared<ValueNode>(
        e,
        std::vector<std::shared_ptr<ValueNode>>{this->node, other.node},
        "pow"
    );

    out_node->requires_grad = this->node->requires_grad || other.node->requires_grad;

    auto self_ptr = this->node;
    auto other_ptr = other.node;
    std::weak_ptr<ValueNode> out_weak = out_node;

    auto _backwards = [self_ptr, other_ptr, out_weak, e]() {
        if (auto out_ptr = out_weak.lock()) {
            if (self_ptr->requires_grad) self_ptr->grad += out_ptr->grad * (other_ptr->data * std::pow(self_ptr->data, other_ptr->data - 1));
            if (other_ptr->requires_grad) other_ptr->grad += out_ptr->grad * (e * std::log(std::max(self_ptr->data, 1e-8)));
        }
    };

    out_node->_backwards = _backwards;

    return Value(out_node);
}

Value Value::relu() const {
    auto out_node = std::make_shared<ValueNode>(
        std::max(0.0, this->node->data),
        std::vector<std::shared_ptr<ValueNode>>{this->node},
        "ReLU"
    );

    out_node->requires_grad = this->node->requires_grad;

    auto self_ptr = this->node;
    std::weak_ptr<ValueNode> out_weak = out_node;

    auto _backwards = [self_ptr, out_weak](){
        if(auto out_ptr = out_weak.lock()){
            if (self_ptr->requires_grad) self_ptr->grad += (self_ptr->data > 0.0) ? out_ptr->grad * 1.0 : 0.0;
        }
    };

    out_node->_backwards = _backwards;

    return Value(out_node);
}

Value Value::tanh() const {
    double t = std::tanh(this->node->data);

    auto out_node = std::make_shared<ValueNode>(
        t,
        std::vector<std::shared_ptr<ValueNode>>{this->node},
        "tanh"
    );

    out_node->requires_grad = this->node->requires_grad;

    auto self_ptr = this->node;
    std::weak_ptr<ValueNode> out_weak = out_node;

    auto _backwards = [self_ptr, out_weak, t](){
        if(auto out_ptr = out_weak.lock()){
            if (self_ptr->requires_grad) self_ptr->grad += out_ptr->grad * (1 - t*t);
        }
    };

    out_node->_backwards = _backwards;

    return Value(out_node);
}

Value Value::sigmoid() const {
    double e = 1 / (1 + std::exp(this->node->data));
    
    auto out_node = std::make_shared<ValueNode>(
        e,
        std::vector<std::shared_ptr<ValueNode>>{this->node},
        "sigmoid"
    );

    out_node->requires_grad = this->node->requires_grad;

    auto self_ptr = this->node;
    std::weak_ptr<ValueNode> out_weak = out_node;

    auto _backwards = [self_ptr, out_weak, e](){
        if(auto out_ptr = out_weak.lock()){
            if (self_ptr->requires_grad) self_ptr->grad += out_ptr->grad * (e * (1 - e)); 
        }
    };

    out_node->_backwards = _backwards;

    return Value(out_node);
}

void Value::backwards() {
    std::vector<std::shared_ptr<ValueNode>> topo;
    std::unordered_set<std::shared_ptr<ValueNode>> visited;

    auto self_ptr = this->node;

    build_topo(self_ptr, visited, topo);
    std::reverse(topo.begin(), topo.end());

    topo[0]->grad = 1.0;
    for(size_t i = 0; i < topo.size(); i++) topo[i]->_backwards();
}

void Value::zero_grad(){
    std::vector<std::shared_ptr<ValueNode>> topo;
    std::unordered_set<std::shared_ptr<ValueNode>> visited;

    auto self_ptr = this->node;

    build_topo(self_ptr, visited, topo);
    std::reverse(topo.begin(), topo.end());

    for(size_t i = 0; i < topo.size(); i++) topo[i]->grad = 0;
}
