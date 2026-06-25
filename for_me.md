curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Harz", "email": "dev@nexgenhost.com", "password": "securepassword123"}'


curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "dev@nexgenhost.com", "password": "securepassword123"}'


curl -X POST https://cloud-platform-5vf4.onrender.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Harz", "email": "dev@nexgenhost.com", "password": "securepassword123"}'



ssh -i ~/.ssh/oracle_nexhost ubuntu@145.241.186.149


Awesome! The setup file has copied over and you are successfully connected to the VM.

Now, while inside the VM terminal (at the ubuntu@nexgenhost-worker-lagos:~$ prompt), run the bootstrap script:

bash
sudo bash setup.sh <YOUR_DOMAIN> <CLOUDFLARE_API_TOKEN>
Replace <YOUR_DOMAIN> with your actual domain (e.g., nexgenhost.ng) and <CLOUDFLARE_API_TOKEN> with your Cloudflare API token (with DNS Edit permissions).

What this will do:
Initialize a 4 GB swap file to give your 1 GB VM enough virtual RAM for builds.
Install Docker, Go 1.22, and Nginx.
Create the dedicated nexhost system user.
Auto-generate the Wildcard SSL certificates using the Certbot Cloudflare plugin (so your dynamically created apps can instantly be served over HTTPS).
Let the script run (it will take around 5–10 minutes as it updates system packages and downloads runtimes). Paste the output or let me know when it says VM Bootstrap Complete!


sudo bash setup.sh naijadevhub.online <CLOUDFLARE_API_TOKEN>

ssh -i ~/.ssh/oracle_nexhost ubuntu@145.241.186.149


CLOUDFLARE_API_TOKEN  = <CLOUDFLARE_API_TOKEN>
CLOUDFLARE_ZONE_ID    = <get from Cloudflare: naijadevhub.online → Overview → Zone ID>
ORACLE_VM_IP          = 145.241.186.149
BASE_DOMAIN           = naijadevhub.online
API_INTERNAL_SECRET   = <run: openssl rand -hex 32>
