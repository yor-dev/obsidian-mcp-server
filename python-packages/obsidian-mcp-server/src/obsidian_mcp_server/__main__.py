import os

from obsidian_mcp_server.mcp_server import ObsidianMCPServer


def main():
    server = ObsidianMCPServer(
        obsidian_base_url=os.environ["OBSIDIAN_HOST"],
        obsidian_api_key=os.environ["OBSIDIAN_API_KEY"],
    )
    server.run()


if __name__ == "__main__":
    main()
