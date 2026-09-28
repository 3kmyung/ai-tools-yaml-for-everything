import html
import json
import pathlib
import re
import string

ASSETS_DIRECTORY = pathlib.Path(__file__).resolve().parent.parent / "assets"
SHELL_DIRECTORY = ASSETS_DIRECTORY / "shell"
STUBS_DIRECTORY = ASSETS_DIRECTORY / "stubs"
TEMPLATES_DIRECTORY = ASSETS_DIRECTORY / "templates"
VERBATIM_COPIES = {
    "index.css": "src/styles/index.css",
    "client.ts": "src/api/client.ts",
}
PACKAGE_FILE = "package.json"
PAGE_FILE = "index.html"
TYPESCRIPT_CONFIG_FILE = "tsconfig.json"
RELEASES_DIRECTORY_NAME = "releases"
WORKSPACES_DIRECTORY_NAME = "workspaces"
WEB_DIRECTORY_NAME = "web"
TEST_ROOT = "test"
CAPTURED_OUTPUT_GLOB = "captured-output*"
OWNED_ROOTS = ("src", TEST_ROOT)
RELEASE_DIRECTORY = "src/release"
DOMAIN_DIRECTORY = "src/domain"
DOMAIN_TEST_DIRECTORY = "test/domain"
RELEASE_DIRECTORIES = (
    RELEASE_DIRECTORY,
    DOMAIN_DIRECTORY,
    DOMAIN_TEST_DIRECTORY,
)
CAPTURED_OUTPUT_READER = "readCapturedOutput"
TITLE_PATTERN = re.compile(r"<title>(.*?)</title>", re.DOTALL)


class TemplateValueError(Exception):
    pass


def read_normalized(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8").replace("\r\n", "\n")


def files_under(directory: pathlib.Path) -> dict[str, pathlib.Path]:
    return {
        path.relative_to(directory).as_posix(): path
        for path in sorted(directory.rglob("*"))
        if path.is_file()
    }


def fixed_copies() -> dict[str, pathlib.Path]:
    copies = files_under(SHELL_DIRECTORY)

    for asset_name, copy_path in VERBATIM_COPIES.items():
        copies[copy_path] = ASSETS_DIRECTORY / asset_name

    return copies


def stub_files() -> dict[str, pathlib.Path]:
    return files_under(STUBS_DIRECTORY)


def render_package(name: str) -> str:
    template = string.Template(
        read_normalized(TEMPLATES_DIRECTORY / PACKAGE_FILE)
    )

    return template.substitute(name=json.dumps(name))


def render_page(title: str) -> str:
    template = string.Template(
        read_normalized(TEMPLATES_DIRECTORY / PAGE_FILE)
    )

    return template.substitute(title=html.escape(title, quote=False))


def render_typescript_config(release_name: str) -> str:
    template = string.Template(
        read_normalized(TEMPLATES_DIRECTORY / TYPESCRIPT_CONFIG_FILE)
    )
    workspace = (
        f"../../../{WORKSPACES_DIRECTORY_NAME}/"
        f"{release_name}/{WEB_DIRECTORY_NAME}"
    )

    return template.substitute(
        workspace=json.dumps(workspace),
        workspace_tests=json.dumps(f"{workspace}/{TEST_ROOT}"),
    )


def rendered_files(name: str, title: str, release_name: str) -> dict[str, str]:
    return {
        PACKAGE_FILE: render_package(name),
        PAGE_FILE: render_page(title),
        TYPESCRIPT_CONFIG_FILE: render_typescript_config(release_name),
    }


def is_release_web_directory(web_directory: pathlib.Path) -> bool:
    return (
        web_directory.name == WEB_DIRECTORY_NAME
        and web_directory.parent.parent.name == RELEASES_DIRECTORY_NAME
    )


def release_name_of(web_directory: pathlib.Path) -> str:
    return web_directory.parent.name


def workspace_directory(release_directory: pathlib.Path) -> pathlib.Path:
    return (
        release_directory.parent.parent
        / WORKSPACES_DIRECTORY_NAME
        / release_directory.name
    )


def workspace_web_directory(web_directory: pathlib.Path) -> pathlib.Path:
    return workspace_directory(web_directory.parent) / WEB_DIRECTORY_NAME


def owner_directory(
    web_directory: pathlib.Path, relative_path: str
) -> pathlib.Path:
    if relative_path.split("/")[0] == TEST_ROOT:
        return workspace_web_directory(web_directory)

    return web_directory


def read_package_name(text: str) -> str:
    try:
        name = json.loads(text).get("name")
    except (json.JSONDecodeError, AttributeError) as error:
        raise TemplateValueError(
            f"{PACKAGE_FILE} is not a JSON object"
        ) from error

    if not isinstance(name, str):
        raise TemplateValueError(f"{PACKAGE_FILE} has no name")

    return name


def read_page_title(text: str) -> str:
    match = TITLE_PATTERN.search(text)

    if match is None:
        raise TemplateValueError(f"{PAGE_FILE} has no <title>")

    return html.unescape(match.group(1))
