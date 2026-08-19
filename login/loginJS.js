users = [
    { id: 1, email: "abc@gmail.com", pass: "123" },
    { id: 2, email: "xyz@gmail.com", pass: "456" }
]

const form = document.querySelector(".form")
const emailInput = document.getElementById("userEmail");
const passwordInput = document.getElementById("password");

form.addEventListener("submit", function (event) {
    event.preventDefault();
    for (let i = 0; i < users.length; i++) {
        if ((users[i].email === emailInput.value) && (users[i].pass === passwordInput.value)) {
            console.log("ok")
            window.location.href = "/IntelliExam-MVP/examPage/examPage.html";
        }
    }
});