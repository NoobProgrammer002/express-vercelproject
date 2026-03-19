console.log("login.js loaded")
const button = document.getElementById('submit')
const submit = document.getElementById('form')
const welcome = document.querySelector('h2')


submit.addEventListener("submit", async function(e){
     console.log("form submit");
    e.preventDefault();
   
    const username = document.getElementById('username').value.trim();
    const password  = document.getElementById('password').value.trim();
    const response = await fetch("/login",{
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({username, password}),
        credentials: "include"
    });
    const data = await response.json()
  if (data.success){
    window.location.href = "scanner.html"
  }else{
    document.getElementById("text").textContent = data.message;
  }
});





