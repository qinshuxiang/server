const axios = require('axios');

axios.post("http://localhost:3000/api/auth/register", {
    username: "testuser",
    password: "testpassword",
    email: "ximing123@123.com"
})
