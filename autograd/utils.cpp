#include "utils.h"
#include <fstream>

void build_topo(std::shared_ptr<ValueNode> root, 
                std::unordered_set<std::shared_ptr<ValueNode>>& visited, 
                std::vector<std::shared_ptr<ValueNode>>& topo) {
    if (visited.find(root) == visited.end()) {
        visited.insert(root);
        
        for (const auto& child : root->children) build_topo(child, visited, topo);
        
        topo.push_back(root);
    }
}

void build_nodes(std::shared_ptr<ValueNode> root, std::unordered_set<std::shared_ptr<ValueNode>>& nodes) {
    if (nodes.find(root) == nodes.end()) {
        nodes.insert(root);
        for (const auto& child : root->children) build_nodes(child, nodes);
    }
}

void show_graph(const Value& root_value) {
    std::unordered_set<std::shared_ptr<ValueNode>> nodes;
    build_nodes(root_value.get_node(), nodes);

    std::ofstream out("grafo.dot");
    out << "digraph G {\n";
    out << "  rankdir=LR;\n";
    
    for (const auto& n : nodes) {
        uintptr_t id = reinterpret_cast<uintptr_t>(n.get());
        
        std::string node_id = "node_" + std::to_string(id);
        
        out << "  " << node_id << " [shape=record, label=\"{ " << n->label << " | data " 
            << std::format("{:.4f}", n->data) << " | grad " 
            << std::format("{:.4f}", n->grad) << " }\"];\n";
            
        if (!n->op.empty()) {
            std::string op_id = "op_" + std::to_string(id);
            
            out << "  " << op_id << " [label=\"" << n->op << "\", shape=oval];\n";
            out << "  " << op_id << " -> " << node_id << ";\n";
            
            for (const auto& child : n->children) {
                uintptr_t cid = reinterpret_cast<uintptr_t>(child.get());
                std::string child_id = "node_" + std::to_string(cid);
                out << "  " << child_id << " -> " << op_id << ";\n";
            }
        }
    }
    out << "}\n";
    out.close();

    (void)std::system("dot -Tpng grafo.dot -o imagen.png");

#ifdef _WIN32
    (void)std::system("start imagen.png");
#elif __APPLE__
    (void)std::system("open imagen.png");
#else
    (void)std::system("xdg-open imagen.png");
#endif
}
