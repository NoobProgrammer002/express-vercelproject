const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(session({
  secret: "attendance-secret-key",
  resave: false,
  saveUninitialized: false
}));

const TEACHERS = [
  { username: "teacher1", password: "pass123" },
  { username: "teacher2", password: "pass456" }
];

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const teacher = TEACHERS.find(t => t.username === username && t.password === password);
  if (teacher) {
    req.session.teacher = teacher.username;
    res.json({ success: true });
  } else {
    res.json({ success: false, message: "Invalid credentials" });
  }
});

app.get("/check-auth", (req, res) => {
  if (req.session.teacher) {
    res.json({ authenticated: true, teacher: req.session.teacher });
  } else {
    res.json({ authenticated: false });
  }
});

app.post("/attendance", (req, res) => {
  if (!req.session.teacher) {
    return res.json({ success: false, message: "Not logged in" });
  }

  const { name, roll, branch } = req.body;

  // validate student against students.json
  const students = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "students.json")));
  const branchList = students[branch];

  if (!branchList) {
    return res.json({ success: false, message: "Invalid branch" });
  }

  const studentExists = branchList.some(s => s.roll === Number(roll));

  if (!studentExists) {
    return res.json({ success: false, message: "Student not found" });
  }

  const teacher = req.session.teacher;
  const filePath = path.join(__dirname, "data", `attendance_${teacher}.json`);

  let attendance = [];
  if (fs.existsSync(filePath)) {
    attendance = JSON.parse(fs.readFileSync(filePath));
  }

  const alreadyScanned = attendance.some(s => s.roll === Number(roll) && s.branch === branch);
  if (alreadyScanned) {
    return res.json({ success: false, message: "Already marked" });
  }

  const record = {
    name, roll, branch,
    time: new Date().toLocaleTimeString(),
    date: new Date().toLocaleDateString()
  };

  attendance.push(record);
  fs.writeFileSync(filePath, JSON.stringify(attendance));
  res.json({ success: true, record });
});
app.get("/download", (req, res) => {
  if (!req.session.teacher) {
    return res.json({ success: false, message: "Not logged in" });
  }

  const teacher = req.session.teacher;
  const filePath = path.join(__dirname, "data", `attendance_${teacher}.json`);

  if (!fs.existsSync(filePath)) {
    return res.json({ success: false, message: "No attendance data found" });
  }

  const attendance = JSON.parse(fs.readFileSync(filePath));

  const BOM = '\uFEFF';
  const header = ['Name', 'Roll', 'Branch', 'Time', 'Date'].join(',');
  const csvRows = attendance.map(record => [
    '"' + record.name.replace(/"/g, '""') + '"',
    record.roll,
    record.branch,
    record.time,
    record.date
  ].join(','));

  const csv = BOM + header + '\r\n' + csvRows.join('\r\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="attendance_${teacher}_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv"`);
  res.send(csv);
});



app.get("/logout", (req, res) => {
  console.log("logout hit");
  console.log("teacher:", req.session.teacher);
  if (req.session.teacher) {
    const filePath = path.join(__dirname, "data", `attendance_${req.session.teacher}.json`);
    if (fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify([]));
    }
  }
  req.session.destroy();
  res.json({ success: true });
});
app.use(express.static("public"));

app.listen(3000, () => {
  console.log("Server running on port 3000");
});