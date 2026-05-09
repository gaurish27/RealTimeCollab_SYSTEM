import os
import shutil
import docker
from flask import Flask, request, jsonify
import git

app = Flask(__name__)
client = docker.from_env()

@app.route('/start', methods=['POST'])
def start_workspace():
    data = request.json
    project_id = data.get('projectId')
    repo_url = data.get('githubRepoUrl')

    if not project_id:
        return jsonify({"error": "projectId is required"}), 400

    container_name = f"workspace_{project_id}"
    workspace_dir = os.path.abspath(f'containers/{container_name}/data')

    # Create workspace directory
    os.makedirs(workspace_dir, exist_ok=True)
    os.chmod(workspace_dir, 0o777)

    # Clone the repo if it's provided and the directory is empty
    if repo_url:
        try:
            if not os.listdir(workspace_dir):
                print(f"Cloning {repo_url} into {workspace_dir}...")
                git.Repo.clone_from(repo_url, workspace_dir)
        except Exception as e:
            print(f"Error cloning repo: {e}")
            return jsonify({"error": f"Failed to clone repository: {str(e)}"}), 500

    try:
        container = client.containers.get(container_name)
        if container.status != 'running':
            container.start()
            container.reload()
    except docker.errors.NotFound:
        print(f"Starting new container {container_name}...")
        try:
            # Map container port 3000 to an available host port dynamically (None)
            container = client.containers.run(
                'gitpod/openvscode-server:latest',
                name=container_name,
                detach=True,
                volumes={workspace_dir: {'bind': '/home/workspace', 'mode': 'rw'}},
                ports={'3000/tcp': None}, 
                command='--host 0.0.0.0'
            )
        except Exception as e:
            print(f"Error starting container: {e}")
            return jsonify({"error": f"Failed to start container: {str(e)}"}), 500

    # Retrieve the dynamically assigned port with a retry loop
    import time
    try:
        host_port = None
        for _ in range(10):
            container.reload()
            ports = container.attrs.get('NetworkSettings', {}).get('Ports', {})
            tcp_ports = ports.get('3000/tcp')
            if tcp_ports and len(tcp_ports) > 0:
                host_port = tcp_ports[0]['HostPort']
                break
            time.sleep(0.5)
            
        if host_port:
            return jsonify({
                "message": "Container started successfully",
                "container": container_name,
                "port": host_port
            }), 200
        else:
            print(f"Failed to get assigned port. Ports object: {ports}")
            return jsonify({"error": f"Failed to get assigned port: {ports}"}), 500
    except Exception as e:
        print(f"Exception while getting ports: {e}")
        return jsonify({"error": f"Port mapping not found: {e}"}), 500

@app.route('/stop', methods=['POST'])
def stop_workspace():
    data = request.json
    project_id = data.get('projectId')
    if not project_id:
        return jsonify({"error": "projectId is required"}), 400
        
    container_name = f"workspace_{project_id}"
    workspace_dir = os.path.abspath(f'containers/{container_name}')
    
    try:
        container = client.containers.get(container_name)
        container.stop()
        container.remove()
        
        # Clean up directory
        if os.path.exists(workspace_dir):
            try:
                shutil.rmtree(workspace_dir)
            except Exception as e:
                print(f"Failed to remove directory: {e}")
            
        return jsonify({"message": f"Container {container_name} stopped and removed."})
    except docker.errors.NotFound:
        return jsonify({"message": f"Container {container_name} not found."}), 404

if __name__ == '__main__':
    # Run on port 7000 as configured in the backend .env
    app.run(host='0.0.0.0', port=7000)