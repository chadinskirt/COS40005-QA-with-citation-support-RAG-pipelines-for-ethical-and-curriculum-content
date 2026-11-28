#ifndef JSONLOADER
#define JSONLOADER
#include <iostream>
#include <nlohmann/json.hpp>
#include <filesystem>
#include <fstream>
#include <vector>
#include <numeric>
#include <tokenizers_cpp.h>

using json = nlohmann::json;
using tokenizers::Tokenizer;
namespace fs = std::filesystem;

enum class DOCTYPE : uint8_t{
    TABLE, TEXT
};

struct JsonDoc{
    fs::path path;
    std::unique_ptr<json> content;
    json& get() {
        return *content;
    }
    const json& get() const {
        return *content;
    }
};

struct ExtractedText {
    uint32_t page_num;
    uint32_t doc_id;

    std::string source;
    std::string id;
    std::string text;
    std::string type;
};

struct Chunk {
    uint64_t chunk_id;
    uint64_t document_id;

    uint32_t page_num;
    uint32_t token_start;
    uint32_t token_end;
    uint32_t token_count;

    std::string source;
    std::string text;
    std::string type;
};

struct ChunkConfig {
    uint32_t max_tokens = 384;
    uint32_t overlap_tokens = 64;
    uint32_t min_tokens = 64;
};

const std::string type_name(DOCTYPE type) {
    switch (type) {
        case DOCTYPE::TABLE: return "TABLE";
        case DOCTYPE::TEXT:  return "TEXT";
    }
    throw std::runtime_error("Unknown chunk type");
}

std::string file_load(const std::string& path){
    std::ifstream file(path, std::ios::in | std::ios::binary);
    if (!file.is_open())
        throw std::runtime_error("Cannot open file: " + path);

     std::string data(
        (std::istreambuf_iterator<char>(file)),
        std::istreambuf_iterator<char>()
    );

    if (file.bad())
        throw std::runtime_error("Failed to read file: " + path);

    
    /*file.seekg(0, std::ios::end);
    std::streampos end = file.tellg();

    if(end = std::streampos(-1)) 
        throw std::runtime_error("cannot determine file size:" + path);

    std::string data(static_cast<size_t>(end), '\0');
    //size_t size = static_cast<size_t>(file.tellg());
    file.seekg(0, std::ios::beg);
    
    if(!file.read(data.data(), static_cast<std::streamsize>(data.size())))
        throw std::runtime_error("Failed to read file: " + path);*/
    return data;
}

class JsonLoader{
    private:
        std::vector<JsonDoc> data;
        std::vector<ExtractedText> output;
    public:
        void load(const fs::path& path) {
            std::ifstream file (path, std::ios::in | std::ios::binary);

            if(!file) throw std::runtime_error("File Loading Fails");

            auto parsed = std::make_unique<json>(json::parse(file));

            JsonDoc doc{path, std::move(parsed)};
            
            data.push_back(std::move(doc));

            std::cout << "Loaded: " << path.filename() << " | Documents: " << data.size() << '\n';
        }
        std::vector<fs::path> DiscoverJson(const std::vector<fs::path>& directories) {
            std::vector<fs::path> files;

            for (const auto& directory : directories) {
                if (!fs::exists(directory))
                    throw std::runtime_error(
                        "Directory does not exist: " + directory.string()
                    );

                if (!fs::is_directory(directory))
                    throw std::runtime_error(
                        "Invalid directory: " + directory.string()
                    );

                for (const auto& entry : fs::directory_iterator(directory)) {
                    if (!entry.is_regular_file())
                        continue;

                    if (entry.path().extension() == ".json")
                        files.push_back(entry.path());
                }
            }

            return files;
        }
        void loadDirectory(
            const std::vector<fs::path>& directories) {
            auto files = DiscoverJson(directories);

            //std::cout << "Discovered JSON files: " << files.size() << '\n';

            for (const auto& path : files)
                load(path);
            //std::cout << "Loaded documents: "<< data.size() << '\n';
        }
        const std::vector<JsonDoc>& getData() const {
            return data;
        }
        const std::vector<ExtractedText>& getcontent() const{
            return output;
        }
        void print() const {
            for (const auto& doc : data) {
                std::cout << "File: " << doc.path << '\n';
                std::cout << "Type: " << doc.content->type_name() << '\n';
                std::cout << "Size: " << doc.content->size() << '\n';
                std::cout << "----------------------\n";
            }
        }
        
        void parse_pagetext() {
            size_t doc_count = 0;
            size_t page_count = 0;
            size_t group_count = 0;
            size_t extracted_count = 0;

            for (const auto& doc : data) {
                ++doc_count;
                const auto& content = doc.get();

                //std::cout << "\n========== DOCUMENT "<< doc_count << " ==========\n";

                if (!content.is_object() ||
                    !content.contains("pdf_header") ||
                    !content["pdf_header"].is_object() ||
                    !content.contains("pages") ||
                    !content["pages"].is_array()) {
                    //std::cout << "[SKIP] Invalid document structure\n";
                    continue;
                }

                const auto& header = content["pdf_header"];

                if (!header.contains("doc_id") ||
                    !header.contains("source")) {
                    //std::cout << "[SKIP] Missing document metadata\n";
                    continue;
                }

                const uint32_t doc_id =
                    header["doc_id"].get<uint32_t>();

                const std::string source =
                    header["source"].get<std::string>();

                //std::cout << "Document ID: " << doc_id << '\n';
                //std::cout << "Pages: " << content["pages"].size() << '\n';

                for (const auto& page : content["pages"]) {
                    ++page_count;

                    //std::cout << "\n  [PAGE " << page_count << "]\n";

                    if (!page.is_object() ||
                        !page.contains("page_num")) {
                        //std::cout << "  [SKIP] Invalid page structure\n";
                        continue;
                    }

                    const uint32_t page_num =
                        page["page_num"].get<uint32_t>();

                    //std::cout << "  Page number: " << page_num << '\n';

                    // Groups are siblings of elements.
                    if (!page.contains("groups") ||
                        !page["groups"].is_array()) {
                        std::cout << "  [SKIP] Missing groups array\n";
                        continue;
                    }

                    const auto& groups = page["groups"];

                    //std::cout << "  Groups found: "      << groups.size() << '\n';

                    for (const auto& group : groups) {
                        ++group_count;

                        if (!group.is_object() ||
                            !group.contains("type") ||
                            group["type"] != "text_group") {
                            /*std::cout << "    [SKIP] Not text_group\n";*/
                            continue;
                        }

                        if (!group.contains("id") ||
                            !group.contains("text") ||
                            !group["id"].is_string() ||
                            !group["text"].is_string()) {
                            /*std::cout << "    [SKIP] Invalid group fields\n";
                            std::cout << group.dump(2) << '\n';*/
                            continue;
                        }
                        DOCTYPE type = DOCTYPE::TEXT;
                        ExtractedText extracted{
                            page_num,
                            doc_id,
                            source,
                            group["id"].get<std::string>(),
                            group["text"].get<std::string>(),
                            type_name(type),
                        };

                        output.emplace_back(std::move(extracted));
                        ++extracted_count;

                        std::cout << "    [EXTRACTED] "
                                << output.back().id
                                << " | Length: "
                                << output.back().text.size()
                                << " | Total: "
                                << extracted_count << '\n';
                    }
                }
            }

            /*std::cout << "\n========== SUMMARY ==========\n";
            std::cout << "Documents: " << doc_count << '\n';
            std::cout << "Pages: " << page_count << '\n';
            std::cout << "Groups visited: " << group_count << '\n';
            std::cout << "Extracted: " << extracted_count << '\n';
            std::cout << "Output size: " << output.size() << '\n';*/
        }


        std::string tabletostring(const json& rows){
            std::string res;
            
            if(!rows.is_array()) return res;
            for(const auto& row : rows){
                if(!row.is_array()) continue;
                bool first = true;
                for(const auto& cell : row){
                    if(!first) res += '\t';
                    first = false;
                    //if row contain cell then get string else dump to string
                    if (cell.is_null())
                    continue;

                    res += cell.is_string()
                        ? cell.get<std::string>(): cell.dump();
                }
                res += '\n';
            }
            return res;
        }
        void extract_tables() {
            size_t doc_count = 0;
            size_t table_count = 0;
            size_t extracted_count = 0;

            for (const auto& doc : data) {
                ++doc_count;
                const auto& content = doc.get();

                //std::cout << "\n========== DOCUMENT " << doc_count << " ==========\n";

                if (!content.is_object() ||
                    !content.contains("pdf_header") ||
                    !content["pdf_header"].is_object() ||
                    !content.contains("tables") ||
                    !content["tables"].is_array()) {
                    //std::cout << "[SKIP] Invalid document/table structure\n";
                    continue;
                }

                const auto& header = content["pdf_header"];

                if (!header.contains("doc_id") ||
                    !header.contains("source")) {
                    //std::cout << "[SKIP] Missing document metadata\n";
                    continue;
                }

                const uint32_t doc_id =
                    header["doc_id"].get<uint32_t>();

                const std::string source =
                    header["source"].get<std::string>();

                const auto& tables = content["tables"];

                //std::cout << "Tables found: " << tables.size() << '\n';

                for (const auto& table : tables) {
                    ++table_count;

                    if (!table.is_object()) {
                        //std::cout << "[SKIP] Table is not an object\n";
                        continue;
                    }

                    if (!table.contains("id") ||
                        !table.contains("page_num") ||
                        !table.contains("rows")) {
                        //std::cout << "[SKIP] Missing table fields\n";
                        continue;
                    }

                    if (!table["id"].is_string() ||
                        !table["rows"].is_array()) {
                        //std::cout << "[SKIP] Invalid table field types\n";
                        continue;
                    }

                    const uint32_t page_num =
                        table["page_num"].get<uint32_t>();

                    std::string text = tabletostring(table["rows"]);
                    DOCTYPE type = DOCTYPE::TABLE;

                    ExtractedText extracted{
                        page_num,
                        doc_id,
                        source,
                        table["id"].get<std::string>(),
                        std::move(text),
                        type_name(type)
                    };

                    output.emplace_back(std::move(extracted));
                    ++extracted_count;

                    /*std::cout << "[EXTRACTED] "
                            << output.back().id
                            << " | Page: " << page_num
                            << " | Text length: "
                            << output.back().text.size()
                            << " | Total: " << extracted_count
                            << '\n';*/
                }
            }

            /*std::cout << "\n========== TABLE EXTRACTION SUMMARY ==========\n";
            std::cout << "Documents: " << doc_count << '\n';
            std::cout << "Tables visited: " << table_count << '\n';
            std::cout << "Tables extracted: " << extracted_count << '\n';
            std::cout << "Total output records: " << output.size() << '\n';*/
        }

};

class chunkWriter{
    private:
        std::ofstream file;
        ChunkConfig config;
        std::vector<Chunk> chunks;

    public:
        void init_chunk(std::vector<Chunk>& chunk){
            chunks = std::move(chunk);
        }
        void open(const fs::path& path){
            file.open(path, std::ios::out | std::ios::app);
            if(!file)
                throw std::runtime_error("failed to open chunk strorage");
        }
        void write() {
            if (!file.is_open())
                throw std::runtime_error("Chunk storage is not open");

            std::cout << "Writer chunks: " << chunks.size() << '\n';

            for (const auto& chunk : chunks) {
                nlohmann::ordered_json record = {
                    {"chunk_id", chunk.chunk_id},
                    {"document_id", chunk.document_id},
                    {"page_num", chunk.page_num},
                    
                    {"type", chunk.type},

                    {"token_start", chunk.token_start},
                    {"token_end", chunk.token_end},
                    {"token_count", chunk.token_count},

                    {"source", chunk.source},
                    {"text", chunk.text}
                };

                file << record.dump() << '\n';

                if (!file)
                    throw std::runtime_error("Failed to write chunk");
            }

            file.flush();

            if (!file)
                throw std::runtime_error("Failed to flush chunk storage");

            std::cout << "Successfully wrote "
                    << chunks.size() << " chunks\n";
        }
        void close(){
            if(file.is_open())
                file.close();
            if(file.fail())
                throw std::runtime_error("Failed to close chunk storage");
        }

};
class Chunker{
    private:
        ChunkConfig config;
        std::unique_ptr<Tokenizer> tokenizer;
    public:
        explicit Chunker(std::unique_ptr<Tokenizer> T) : tokenizer(std::move(T)){};
        void chunk_split(
            const std::vector<ExtractedText>& input,
            std::vector<Chunk>& output
        ) {
            uint64_t next_chunk_id = 0;
            uint64_t global_offset = 0;

            // tokens setup
            const uint32_t max_tokens = config.max_tokens;
            const uint32_t advance = max_tokens - config.overlap_tokens;

            //chunk_split input validation
            if (max_tokens == 0 || config.overlap_tokens >= max_tokens || config.min_tokens > max_tokens) {
                throw std::invalid_argument("Invalid chunk configuration");
            }

            std::vector<int32_t> buffer;

            std::string buffer_type;
            uint32_t document_id = 0;
            uint32_t page_num = 0;
            std::string source;

            bool initialized = false;

            auto flush = [&](bool final) {
                //while not first chunks
                while (buffer.size() >= max_tokens || (final && buffer.size() >= config.min_tokens)) {
                    //choose min for wether max tokens or max buffer size
                    const uint32_t count = std::min(max_tokens,static_cast<uint32_t>(buffer.size()));
                    //config token storage
                    std::vector<int32_t> token_splice(buffer.begin(), buffer.begin() + count);

                    Chunk chunk{
                        .chunk_id = next_chunk_id++,
                        .document_id = document_id,
                        .page_num = page_num,
                        .token_start = static_cast<uint32_t>(global_offset),
                        .token_end = static_cast<uint32_t>(global_offset + count),
                        .token_count = count,
                        .source = source,
                        .text = tokenizer->Decode(token_splice, true),
                        .type = buffer_type
                    };

                    output.emplace_back(std::move(chunk));
                    //decide next offset position wether at max buffered or next overlap window
                    const uint32_t consumed = count == max_tokens ? advance : count;
                    //free old buffer from begin while preserve next overlap budget
                    buffer.erase(buffer.begin(), buffer.begin() + consumed);
                    //increase id
                    global_offset += consumed;
                    //break if rest of count smaller than max tokens size
                    if (count < max_tokens)
                        break;
                }
                //clear dirty buffer component not capacity
                if (final)
                    buffer.clear();
            };

            for (const auto& in : input) {
                // check boundary type, docid and page_num match current context
                const bool boundary = initialized && (in.type != buffer_type || in.doc_id != document_id || in.page_num != page_num);

                //if condition didnt reach flush and clear buffer 
                if (boundary) {
                    flush(true);
                }
                //if first chunk init and within valid boundaries
                if (!initialized || boundary) {
                    buffer_type = in.type;
                    document_id = in.doc_id;
                    page_num = in.page_num;
                    source = in.source;
                    initialized = true;
                }

                //else process normally
                //NOTE: within chunker tokenizer this dont process specialize character but 
                //models tokenizing some models like BERT family might required it
                auto batch = tokenizer->Encode(in.text, false);

                //work like memcpy lol
                buffer.insert( buffer.end(), batch.begin(), batch.end());

                flush(false);
            }

            if (initialized)
                flush(true);
        };
};
#endif