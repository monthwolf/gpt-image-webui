# GitHub Actions Docker Publish

This repository includes `.github/workflows/docker-publish.yml`.
Pushing a new Git tag builds the Docker image and pushes it to Docker Hub.

## Required GitHub Actions Configuration

Configure these values in `Settings -> Secrets and variables -> Actions`:

- Variable `DOCKERHUB_USERNAME`: Docker Hub username.
- Variable `DOCKERHUB_PROJECT`: Docker Hub project/repository name, for example `gpt-image-webui`.
- Secret `DOCKERHUB_TOKEN`: Docker Hub access token with push permission.

The pushed image name is:

```text
docker.io/<DOCKERHUB_USERNAME>/<DOCKERHUB_PROJECT>
```

## Release Example

```powershell
git tag v1.0.0
git push origin v1.0.0
```

The workflow publishes:

```text
docker.io/<DOCKERHUB_USERNAME>/<DOCKERHUB_PROJECT>:v1.0.0
docker.io/<DOCKERHUB_USERNAME>/<DOCKERHUB_PROJECT>:latest
```

