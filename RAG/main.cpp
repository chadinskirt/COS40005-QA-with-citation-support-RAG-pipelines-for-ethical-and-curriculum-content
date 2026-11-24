
#include "tokenizer/loader.hpp"

#include <cassert>
#include <iostream>
#include <filesystem>
#include <vector>

namespace fs = std::filesystem;

int main() {
    JsonLoader loader;

    std::vector<fs::path> files{
        "/mnt/d/COS40005-QA-with-citation-support-RAG-pipelines-for-ethical-and-curriculum-content/doc/JSON/COS20019-Unit Outline-Sem Sep_2025.json",
        "/mnt/d/COS40005-QA-with-citation-support-RAG-pipelines-for-ethical-and-curriculum-content/doc/JSON/COS10009_UnitOutline_Sep2024_HCMC_V1.json"
    };

    // Test 1: Load files
    for (const auto& path : files) {
        loader.load(path);
    }

    std::cout << "[PASS] File loading\n";

    // Test 2: Validate loaded documents
    const auto& documents = loader.getData();

    assert(documents.size() == files.size());

    std::cout << "[PASS] Document count\n";

    // Test 3: Validate JSON content
    for (const auto& doc : documents) {
        assert(doc.content != nullptr);

        const nlohmann::json& data = doc.get();

        assert(!data.is_discarded());
        assert(!data.is_null());

        std::cout << "File: " << doc.path.filename() << '\n';
        std::cout << "JSON Type: " << data.type_name() << '\n';
        std::cout << "Top-level size: " << data.size() << '\n';
    }

    std::cout << "[PASS] JSON parsing\n";

    // Test 4: Print loader summary
    loader.print();

    std::cout << "\nAll tests passed!\n";

    return 0;
}
