async function checkAuth() {
  const response = await fetch("http://localhost:3000/check-auth", {
    credentials: "include"
  });
  const data = await response.json();
  if (!data.authenticated) {
    window.location.href = "login.html";
  }
}
checkAuth();


async function saveAttendance(data) {
  const response = await fetch("http://localhost:3000/attendance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data)
  });
  return await response.json();
}

const today = new Date();

const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Builds a string like "Thu, 19 Mar 2026" and puts it in the chip
document.getElementById('dateChip').textContent =
  DAY_NAMES[today.getDay()] + ', ' +
  today.getDate() + ' ' +
  MONTH_NAMES[today.getMonth()] + ' ' +
  today.getFullYear();


/* -------------------------------------------------------------
   2. STATE — Variables shared across functions
------------------------------------------------------------- */

const rows = [];       // Array of student attendance objects
let rowCounter = 0;    // Auto-incrementing ID for each row
let cameraStream = null; // Holds the active MediaStream (camera)


/* -------------------------------------------------------------
   3. CAMERA — Start and stop the device camera
------------------------------------------------------------- */

/**
 * startCamera()
 * Asks the browser for camera permission, then streams the
 * rear camera into the <video id="cameraFeed"> element.
 *
 * After the camera is running, plug in your QR library here.
 * When a QR code is decoded, call:  onQRSuccess(studentName)
 */
async function startCamera() {
  try {
    // Request the rear-facing camera (environment)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });

    cameraStream = stream;

    // Attach the stream to the video element and fade it in
    const video = document.getElementById('cameraFeed');
    video.srcObject = stream;
    video.classList.add('active');

    // Hide the idle hint text
    document.getElementById('vfHint').style.display = 'none';

    // Swap the buttons: hide Start, show Stop
    document.getElementById('startBtn').style.display = 'none';
    document.getElementById('stopBtn').classList.add('visible');

    // Update the status indicator to "Live"
    document.querySelector('.cam-dot').classList.add('live');
    document.getElementById('camStatusText').textContent = 'Live';

    // ── PLUG YOUR QR LIBRARY IN HERE ──────────────────────────
    // Pass `video` to your QR scanning library.
    // When it successfully decodes a QR code, call:
    //   onQRSuccess(studentName)
    //
    // Example with jsQR:
      startJsQRLoop(video);
    //
    // Example with html5-qrcode:
    //   html5QrScanner.start(video, config, onQRSuccess);
    // ──────────────────────────────────────────────────────────

  } catch (err) {
    // User denied camera permission or no camera found
    showToast('Camera access denied');
    console.error('Camera error:', err);
  }
}


/**
 * stopCamera()
 * Stops all camera tracks and resets the viewfinder back to
 * its idle state.
 */
function stopCamera() {
  // Stop every track in the stream (turns the camera light off)
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  // Detach the stream from the video element and hide it
  const video = document.getElementById('cameraFeed');
  video.srcObject = null;
  video.classList.remove('active');

  // Show the idle hint text again
  document.getElementById('vfHint').style.display = '';

  // Swap the buttons back: show Start, hide Stop
  document.getElementById('startBtn').style.display = '';
  document.getElementById('stopBtn').classList.remove('visible');

  // Update the status indicator to "Idle"
  document.querySelector('.cam-dot').classList.remove('live');
  document.getElementById('camStatusText').textContent = 'Idle';
}
function startJsQRLoop(video) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  function loop() {
    if (!cameraStream) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, canvas.width, canvas.height);
    if (code) {
      onQRSuccess(code.data);
    }
    requestAnimationFrame(loop);
  }

  video.onloadedmetadata = () => loop();
}

/* -------------------------------------------------------------
   4. QR SUCCESS HANDLER
      Call this function from your QR library when a code is
      successfully decoded. It adds the student to the table.
------------------------------------------------------------- */

/**
 * onQRSuccess(studentName)
 *
 * @param {string} studentName  — the name decoded from the QR code
 *
 * This is the single entry point between your QR backend and
 * the attendance table. Wire it up like this:
 *
 *   yourQRLibrary.onDecode = function(result) {
 *     onQRSuccess(result.text);   // or result.data, etc.
 *   };
 */
async function onQRSuccess(decodedText) {
  try {
    const data = JSON.parse(decodedText);
    const result = await saveAttendance(data);

    if (!result.success) {
      showToast(result.message); // "Already marked" etc.
      return;
    }

    // flash and table update (your existing code)
    const flashOverlay = document.getElementById('flash');
    flashOverlay.classList.add('on');
    setTimeout(() => flashOverlay.classList.remove('on'), 320);

    const now = new Date();
    const time = String(now.getHours()).padStart(2, '0') + ':' +
                 String(now.getMinutes()).padStart(2, '0');

    rowCounter++;
    rows.unshift({
      id: rowCounter,
      name: result.record.name,
      roll: result.record.roll,
      branch: result.record.branch,
      time: time,
      status: 'present'
    });

    renderTable();
    showToast('✓ ' + result.record.name + ' marked present', true);

  } catch(e) {
    showToast('Invalid QR code');
  }
}


/* -------------------------------------------------------------
   5. TABLE — Render, edit, toggle, and delete rows
------------------------------------------------------------- */

/**
 * renderTable()
 * Rebuilds the entire table body from the rows[] array.
 * Called after any change (new scan, toggle, delete).
 */
function renderTable() {
  const tbody = document.getElementById('tableBody');

  // Show the empty state if there are no rows yet
  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">No scans yet — tap Start Camera</td>
      </tr>`;
    return;
  }

  // Build one <tr> per student row
  tbody.innerHTML = rows.map((student, index) => `
    <tr class="${index === 0 ? 'new-row' : ''}">

      <!-- Row number (muted, monospaced) -->
      <td style="color:var(--muted); font-family:'DM Mono',monospace; font-size:.7rem">
        ${student.id}
      </td>

      <!-- Editable student name
           - contenteditable lets the teacher tap and rename
           - onblur saves when the teacher taps away
           - Enter key blurs the field (triggers save)         -->
      <td>
        <span
          class="name-cell"
          contenteditable="true"
          onblur="updateName(${student.id}, this.textContent.trim())"
          onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }"
        >${escapeHTML(student.name)}</span>
      </td>

      <!-- Scan time -->
      <td style="font-family:'DM Mono',monospace; font-size:.72rem; color:var(--muted)">
        ${student.time}
      </td>

      <!-- Present / Absent toggle pill -->
      <td>
        <button class="status-pill ${student.status}" onclick="toggleStatus(${student.id})">
          <span class="dot"></span>
          ${student.status === 'present' ? 'Present' : 'Absent'}
        </button>
      </td>

      <!-- Delete row button -->
      <td>
        <button class="del-btn" onclick="deleteRow(${student.id})" title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
          </svg>
        </button>
      </td>

    </tr>`).join('');
}


/**
 * updateName(id, newName)
 * Saves an edited student name back into the rows array.
 * Called automatically when the teacher taps away from the name cell.
 *
 * @param {number} id       — the row's unique ID
 * @param {string} newName  — the text the teacher typed
 */
function updateName(id, newName) {
  const student = rows.find(r => r.id === id);
  if (student && newName) {
    student.name = newName;
  }
}


/**
 * toggleStatus(id)
 * Flips a student's status between "present" and "absent"
 * when the teacher taps the status pill.
 *
 * @param {number} id — the row's unique ID
 */
function toggleStatus(id) {
  const student = rows.find(r => r.id === id);
  if (!student) return;

  student.status = student.status === 'present' ? 'absent' : 'present';
  renderTable();
}


/**
 * deleteRow(id)
 * Removes a student row entirely from the array and re-renders.
 *
 * @param {number} id — the row's unique ID
 */
function deleteRow(id) {
  const index = rows.findIndex(r => r.id === id);
  if (index !== -1) {
    rows.splice(index, 1);
  }
  renderTable();
}


/* -------------------------------------------------------------
   6. DOWNLOAD — Export the table as a CSV file (opens in Excel)
------------------------------------------------------------- */

/**
 * downloadExcel()
 * Converts the rows[] array into a CSV string and triggers a
 * file download. The UTF-8 BOM (\uFEFF) at the start tells
 * Excel to interpret special characters correctly.
 */
function downloadExcel() {
  if (rows.length === 0) {
    showToast('No data to download');
    return;
  }
  window.location.href = "http://localhost:3000/download";
  showToast('✓ Downloaded — opens in Excel', true);
}


/* -------------------------------------------------------------
   7. TOAST — Show a brief notification at the bottom
------------------------------------------------------------- */

let toastTimer; // Keeps track of the auto-hide timer

/**
 * showToast(message, isGreen)
 * Slides a notification bar up from the bottom of the screen
 * and auto-hides it after 2.4 seconds.
 *
 * @param {string}  message  — the text to display
 * @param {boolean} isGreen  — true = green (success), false = dark (neutral/error)
 */
function showToast(message, isGreen = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className   = 'toast show' + (isGreen ? ' green' : '');

  // Clear any existing timer so rapid calls don't overlap
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = 'toast'; // removes "show", slides it back down
  }, 2400);
}


/* -------------------------------------------------------------
   8. HELPERS
------------------------------------------------------------- */

/**
 * escapeHTML(str)
 * Converts &, < and > to safe HTML entities so that student
 * names containing those characters don't break the table.
 *
 * @param  {string} str — raw string
 * @return {string}     — HTML-safe string
 */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
document.getElementById("logout-btn").addEventListener("click", async function() {
  await fetch("http://localhost:3000/logout", {
    credentials: "include"
  });
  window.location.href = "login.html";
});