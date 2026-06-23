curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Harz", "email": "dev@nexgenhost.com", "password": "securepassword123"}'


curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "dev@nexgenhost.com", "password": "securepassword123"}'
