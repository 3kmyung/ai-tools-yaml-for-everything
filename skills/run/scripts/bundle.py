import io
import pathlib
import subprocess
import tarfile
import typing

import locate

SKIPPED_DIRECTORY_NAMES = {
    "node_modules",
    ".venv",
    "__pycache__",
    ".git",
    "dist",
    ".pnpm-store",
}


def git_output(arguments: list[str], repository: pathlib.Path) -> bytes:
    result = subprocess.run(
        ["git", *arguments], cwd=repository, capture_output=True, check=False
    )

    if result.returncode != 0:
        error_output = result.stderr.decode("utf-8", "replace").strip()
        raise locate.RunError(f"git {' '.join(arguments)} failed: {error_output}")

    return result.stdout


def repository_root(start: pathlib.Path) -> pathlib.Path:
    return pathlib.Path(
        git_output(["rev-parse", "--show-toplevel"], start).decode("utf-8").strip()
    )


def project_name(start: pathlib.Path) -> str:
    common_directory = git_output(
        ["rev-parse", "--path-format=absolute", "--git-common-dir"], start
    )

    return pathlib.Path(common_directory.decode("utf-8").strip()).parent.name


def branch_exists(repository: pathlib.Path, branch: str) -> bool:
    return (
        subprocess.run(
            ["git", "rev-parse", "--verify", "--quiet", branch],
            cwd=repository,
            capture_output=True,
            check=False,
        ).returncode
        == 0
    )


def copy_archive(source: bytes, destination: tarfile.TarFile) -> None:
    with tarfile.open(fileobj=io.BytesIO(source), mode="r:") as archive:
        for member in archive:
            data = archive.extractfile(member) if member.isfile() else None
            destination.addfile(member, data)


def add_directory(
    directory: pathlib.Path, destination: tarfile.TarFile, prefix: str
) -> None:
    def excluded(member: tarfile.TarInfo) -> tarfile.TarInfo | None:
        return (
            None
            if pathlib.PurePosixPath(member.name).name in SKIPPED_DIRECTORY_NAMES
            else member
        )

    destination.add(directory, arcname=prefix, filter=excluded)


def service_source(
    repository: pathlib.Path, service: str
) -> tuple[str, pathlib.Path | str]:
    directory = pathlib.Path(service)

    if directory.is_dir():
        return directory.resolve().name, directory.resolve()

    name = pathlib.PurePosixPath(service).name
    candidates = [
        repository / "releases" / name,
        pathlib.Path.cwd() / "releases" / name,
    ]

    for candidate in candidates:
        if (candidate / locate.COMPOSE_FILE).is_file():
            return name, candidate

    for branch in (f"releases/{name}", f"origin/releases/{name}"):
        if branch_exists(repository, branch):
            return name, branch

    raise locate.RunError(
        f"service {service} is neither a directory"
        f" nor a local or origin releases/{name} branch"
    )


def workspace_archive(
    repository: pathlib.Path,
    reference: str,
    service: str,
    machine_files: typing.Iterable[pathlib.Path],
) -> tuple[str, bytes]:
    name, source = service_source(repository, service)
    buffer = io.BytesIO()

    with tarfile.open(fileobj=buffer, mode="w:") as archive:
        copy_archive(
            git_output(["archive", "--format=tar", reference], repository), archive
        )

        if isinstance(source, pathlib.Path):
            add_directory(source, archive, f"releases/{name}")
        else:
            service_tree = git_output(
                ["archive", "--format=tar", source, f"releases/{name}"], repository
            )
            copy_archive(service_tree, archive)

        for path in machine_files:
            archive.add(path, arcname=path.name)

    return name, buffer.getvalue()
