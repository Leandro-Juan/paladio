#ifndef __UTILS_H__
#define __UTILS_H__

#include "Value.h"

void build_topo(std::shared_ptr<ValueNode> root, std::unordered_set<std::shared_ptr<ValueNode>>& visited, std::vector<std::shared_ptr<ValueNode>>& topo);

void build_nodes(std::shared_ptr<ValueNode> root, std::unordered_set<std::shared_ptr<ValueNode>>& nodes);

void show_graph(const Value& root_value);

#endif
