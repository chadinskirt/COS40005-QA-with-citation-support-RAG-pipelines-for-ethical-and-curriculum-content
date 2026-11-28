
#include "tokenizer/loader.hpp"

#include <cassert>
#include <iostream>
#include <filesystem>
#include <vector>

namespace fs = std::filesystem;
using tokenizers::Tokenizer;

int main() {
    JsonLoader loader;
    std::vector<Chunk> chunks;
    chunkWriter writer;
    std::string path = "/mnt/d/COS40005-QA-with-citation-support-RAG-pipelines-for-ethical-and-curriculum-content/doc/chunks/tokenizer.json";
    fs::path chunk_path = "/mnt/d/COS40005-QA-with-citation-support-RAG-pipelines-for-ethical-and-curriculum-content/doc/chunks/chunk.jsonl";

    std::vector<fs::path> files{
        "/mnt/d/COS40005-QA-with-citation-support-RAG-pipelines-for-ethical-and-curriculum-content/doc/JSON"
    };

    loader.loadDirectory(files);
    loader.parse_pagetext();
    loader.extract_tables();
    //loader.print();
    std::cerr << "Loading tokenizer...\n";

    auto blob = file_load(path);

    std::cerr << "Tokenizer JSON loaded: "
            << blob.size() << " bytes\n";

    auto token = Tokenizer::FromBlobJSON(blob);

    std::cerr << "Tokenizer initialized\n";

    Chunker chunk(std::move(token));

    std::cout << "Extracted: " << loader.getcontent().size() << '\n';

    chunk.chunk_split(loader.getcontent(), chunks);
    std::cout << "Chunked: " << chunks.size() << '\n';
    writer.init_chunk(chunks);
    writer.open(chunk_path);
    writer.write();
    writer.close();

    return 0;
}
