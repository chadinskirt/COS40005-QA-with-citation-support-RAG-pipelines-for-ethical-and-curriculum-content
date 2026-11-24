#ifndef JSONLOADER
#define JSONLOADER
#include <iostream>
#include <nlohmann/json.hpp>
#include <filesystem>
#include <fstream>
#include <vector>
#include <tokenizers_cpp.h>

using json = nlohmann::json;
namespace fs = std::filesystem;

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

    std::string doc_id;
    std::string id;
    std::string text;
    std::string role;
};

class JsonLoader{
    private:
        std::vector<JsonDoc> data;
        std::vector<ExtractedText> output;
        std::ofstream file;
    public:
        void load(const fs::path& path) {
            std::ifstream file (path, std::ios::in | std::ios::binary);

            if(!file) throw std::runtime_error("File Loading Fails");

            auto parsed = std::make_unique<json>(json::parse(file));

            JsonDoc doc{path, std::move(parsed)};
            
            data.push_back(std::move(doc));
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

            for (const auto& path : files)
                load(path);
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
        void parse_pagetext(){
            for(auto& doc : data){
                if(!doc.content->contains("pages") || !doc.content->is_array()){
                    return;
                }
            }
            for (const auto& pages : data){
                for(const auto& page : pages.content->operator[]("pages")){
                    if(!page.contains("page_num")) continue;
                    const uint32_t page_num = page["page_num"].get<uint32_t>();
                    if (!page.contains("elements") || !page["elements"].is_object()) continue;
                    const auto& elems = page["elements"];
                    if(!elems.contains("groups") || !elems["groups"].is_array()) continue;
                    for(const auto& group : elems["groups"]){
                        if (!group.contains("type") ||
                            group["type"] != "text_group")
                            continue;

                        if (!group.contains("text") ||
                            !group.contains("id"))
                            continue;
                        ExtractedText extracted{
                            page_num,
                            group["id"].get<std::string>(),
                            group["text"].get<std::string>(),
                            group.value("role", std::string{}),
                        };

                        output.emplace_back(std::move(extracted));
                    }
                }
            }
        };
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
        void extract_tables(){
            for(const auto& doc : data){
                const auto& content = doc.get();

                if (!content.contains("tables") ||!content["tables"].is_array())
                    continue;
                    
                for(const auto& docu : content["tables"]){
                    if(!docu.contains("tables") || !docu["tables"].is_array()) return;
                    for(const auto& table : docu["tables"]){
                        if(!table.contains("id") || !table.contains("page_num") || !table.contains("rows")) continue;
                        ExtractedText extracted{
                            table["page_num"].get<uint32_t>(),
                            table["id"].get<std::string>(),
                            tabletostring(table["rows"]),
                            table.value("type", std::string{}),
                        };
                        output.emplace_back(std::move(extracted));
                    }
                }
            }
        }
};
#endif