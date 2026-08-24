// API Pulse JS controller

// Global variables for Chart and State
let latencyChartInstance = null;
let currentSelectedLog = null;

document.addEventListener("DOMContentLoaded", () => {
    // CRITICAL: Wrap optional visual effects in try/catch so core app always renders
    try {
        initCursorGlow();
    } catch (e) {
        console.warn("Optional cursor glow failed:", e);
    }

    try {
        initRevealObserver();
    } catch (e) {
        console.warn("Optional reveal observer failed:", e);
        // Fallback: make everything visible immediately
        document.querySelectorAll(".reveal").forEach(el => {
            el.style.opacity = "1";
            el.style.transform = "none";
        });
    }

    // Animate hero elements on load (they start with opacity:0 in CSS)
    try {
        initHeroAnimations();
    } catch (e) {
        console.warn("Optional hero animations failed:", e);
    }

    // Initial data fetch — this MUST run
    refreshDashboard();
    
    // Set up auto-refresh every 20 seconds to keep stats fresh
    setInterval(refreshDashboard, 20000);
});

/* --- 1. Custom Cursor Glow --- */
function initCursorGlow() {
    const glow = document.getElementById("cursor-glow");
    if (!glow) return;
    
    window.addEventListener("mousemove", (e) => {
        // Move glow centered on cursor
        glow.style.left = `${e.clientX}px`;
        glow.style.top = `${e.clientY}px`;
    });
}

/* --- 1b. Scroll Reveal Observer (IntersectionObserver) --- */
function initRevealObserver() {
    const revealElements = document.querySelectorAll(".reveal");
    if (!revealElements.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: "0px 0px -30px 0px"
    });

    revealElements.forEach(el => observer.observe(el));
}

/* --- 1c. Hero Element Staggered Animations --- */
function initHeroAnimations() {
    const heroElements = document.querySelectorAll(
        ".hero-title, .hero-subtitle, .hero-cta-wrapper, .logo-text, .pulse-indicator"
    );

    heroElements.forEach((el, index) => {
        setTimeout(() => {
            el.style.transition = "opacity 0.6s ease-out, transform 0.6s ease-out";
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
        }, 150 + index * 120);
    });
}

/* --- 2. Tab switcher --- */
function switchTab(type) {
    // Reset active tab button
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.remove("active");
    });
    
    // Hide all panels
    document.querySelectorAll(".form-panel").forEach(panel => {
        panel.classList.remove("active");
    });
    
    // Activate clicked tab by finding the button that triggered this
    const allBtns = document.querySelectorAll(".tab-btn");
    if (type === 'single') {
        allBtns[0].classList.add("active");
        document.getElementById("single-form-panel").classList.add("active");
    } else {
        allBtns[1].classList.add("active");
        document.getElementById("multiple-form-panel").classList.add("active");
    }
}

/* --- 3. Single Check Route Action --- */
async function checkSingleApi() {
    const urlInput = document.getElementById("endpoint-url").value.trim();
    const thresholdInput = document.getElementById("threshold-input").value;
    const errorDiv = document.getElementById("single-validation-error");
    const checkBtn = document.getElementById("single-check-btn");
    
    // Clear validation messages
    errorDiv.style.display = "none";
    errorDiv.textContent = "";
    
    if (!urlInput) {
        showError(errorDiv, "Please enter an API URL.");
        return;
    }
    
    // Show loading state
    setButtonLoading(checkBtn, true);
    
    try {
        const response = await fetch("/api/check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                url: urlInput,
                threshold_ms: parseInt(thresholdInput) || 1000
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            showError(errorDiv, data.error || "Failed to perform check.");
        } else {
            // Trigger automatic scroll down to dashboard to show results
            document.getElementById("dashboard-section").scrollIntoView({ behavior: 'smooth' });
        }
    } catch (err) {
        showError(errorDiv, "Unable to reach API Pulse server.");
        console.error(err);
    } finally {
        setButtonLoading(checkBtn, false);
        // Reload summary and history
        refreshDashboard();
    }
}

/* --- 4. Multiple Checks Route Action --- */
async function checkMultipleApis() {
    const textarea = document.getElementById("endpoints-textarea").value.trim();
    const thresholdInput = document.getElementById("threshold-input").value;
    const errorDiv = document.getElementById("multiple-validation-error");
    const checkBtn = document.getElementById("multiple-check-btn");
    
    errorDiv.style.display = "none";
    errorDiv.textContent = "";
    
    if (!textarea) {
        showError(errorDiv, "Please enter at least one URL.");
        return;
    }
    
    // Split and parse URLs
    const urls = textarea.split("\n")
        .map(u => u.trim())
        .filter(u => u.length > 0);
        
    if (urls.length === 0) {
        showError(errorDiv, "No valid URLs entered.");
        return;
    }
    
    setButtonLoading(checkBtn, true);
    
    try {
        const response = await fetch("/api/check-multiple", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                urls: urls,
                threshold_ms: parseInt(thresholdInput) || 1000
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            showError(errorDiv, data.error || "Failed to perform batch monitoring.");
        } else {
            document.getElementById("dashboard-section").scrollIntoView({ behavior: 'smooth' });
        }
    } catch (err) {
        showError(errorDiv, "Unable to reach API Pulse server.");
        console.error(err);
    } finally {
        setButtonLoading(checkBtn, false);
        refreshDashboard();
    }
}

/* --- Helper to control load spinners --- */
function setButtonLoading(btn, isLoading) {
    if (isLoading) {
        btn.classList.add("loading");
        btn.disabled = true;
    } else {
        btn.classList.remove("loading");
        btn.disabled = false;
    }
}

function showError(element, msg) {
    element.textContent = msg;
    element.style.display = "block";
}

/* --- 5. Reset History Route Action --- */
async function clearAllHistory() {
    if (!confirm("Are you sure you want to clear the entire API Pulse diagnostics history?")) {
        return;
    }
    
    try {
        await fetch("/api/clear", { method: "POST" });
        refreshDashboard();
        resetInspector();
    } catch (err) {
        console.error("Failed to clear history", err);
    }
}

/* --- 6. Fetching and Refreshing Dashboard Metrics --- */
async function refreshDashboard() {
    try {
        // Run concurrent fetches for history and summary
        const [summaryRes, historyRes] = await Promise.all([
            fetch("/api/summary"),
            fetch("/api/history?limit=100")
        ]);
        
        const summaryData = await summaryRes.json();
        const historyData = await historyRes.json();
        
        // 1. Update Metrics
        updateMetrics(summaryData.global, historyData);
        
        // 2. Update Monitored Targets list
        updateMonitoredList(summaryData.by_url);
        
        // 3. Update Chart
        updateChart(historyData);
        
        // 4. Update Logs Table
        updateLogsTable(historyData);
        
    } catch (err) {
        console.error("Error refreshing dashboard statistics:", err);
    }
}

function updateMetrics(globalSummary, historyList) {
    const uptimeVal = document.getElementById("metric-uptime");
    const latencyVal = document.getElementById("metric-latency");
    const totalVal = document.getElementById("metric-total");
    const scoreVal = document.getElementById("metric-score");
    
    if (!globalSummary || globalSummary.total_checks === 0) {
        uptimeVal.textContent = "0.0%";
        latencyVal.textContent = "0ms";
        totalVal.textContent = "0";
        scoreVal.textContent = "0%";
        return;
    }
    
    // Count exact items in history to compute custom health score
    let total = historyList.length;
    let upChecks = historyList.filter(l => l.status === "UP").length;
    let slowChecks = historyList.filter(l => l.status === "SLOW").length;
    let httpErrChecks = historyList.filter(l => l.status === "HTTP_ERROR").length;
    let srvErrChecks = historyList.filter(l => l.status === "SERVER_ERROR").length;
    let redirectChecks = historyList.filter(l => l.status === "REDIRECT").length;
    
    // Premium Health Score: UP=100%, REDIRECT=90%, SLOW=70%, HTTP_ERROR=40%, SERVER_ERROR=20%, DOWN=0%
    const healthScore = total > 0 
        ? Math.round(((upChecks * 1.0 + redirectChecks * 0.9 + slowChecks * 0.7 + httpErrChecks * 0.4 + srvErrChecks * 0.2) / total) * 100)
        : 0;
        
    // Animate stats values cleanly
    animateValue(uptimeVal, parseFloat(uptimeVal.textContent), globalSummary.uptime_percentage, "%");
    animateValue(latencyVal, parseInt(latencyVal.textContent), globalSummary.avg_response_time_ms, "ms");
    animateValue(totalVal, parseInt(totalVal.textContent), globalSummary.total_checks, "");
    animateValue(scoreVal, parseInt(scoreVal.textContent), healthScore, "%");
}

/* Stat increment animation counter */
function animateValue(obj, start, end, suffix) {
    if (start === end) {
        obj.textContent = end + suffix;
        return;
    }
    
    let current = start;
    const range = end - start;
    const duration = 800; // ms
    let startTime = null;
    
    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        current = start + (range * progress);
        
        if (suffix === "%" || (suffix === "ms" && !Number.isInteger(end))) {
            obj.textContent = current.toFixed(1) + suffix;
        } else {
            obj.textContent = Math.round(current) + suffix;
        }
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.textContent = end + suffix;
        }
    }
    
    window.requestAnimationFrame(step);
}

/* --- 7. Update Checked Targets List --- */
function updateMonitoredList(byUrlSummaries) {
    const container = document.getElementById("endpoints-list");
    container.innerHTML = "";
    
    if (!byUrlSummaries || Object.keys(byUrlSummaries).length === 0) {
        container.innerHTML = `<div class="empty-state">No monitored targets.</div>`;
        return;
    }
    
    // Sort target by total checks descending
    const urls = Object.keys(byUrlSummaries).sort((a, b) => {
        return byUrlSummaries[b].total_checks - byUrlSummaries[a].total_checks;
    });
    
    urls.forEach(url => {
        const stats = byUrlSummaries[url];
        
        // Determine badge from uptime: fully down = DOWN, partial = HTTP_ERROR, all reachable = UP
        let statusBadge = "UP";
        let badgeClass = "badge-up";
        
        if (stats.uptime_percentage === 0) {
            statusBadge = "DOWN";
            badgeClass = "badge-down";
        } else if (stats.uptime_percentage < 100) {
            statusBadge = "PARTIAL";
            badgeClass = "badge-slow";
        } else if (stats.avg_response_time_ms > 1000) {
            statusBadge = "SLOW";
            badgeClass = "badge-slow";
        }
        
        const item = document.createElement("div");
        item.className = "endpoint-status-item";
        item.onclick = () => {
            // Set URL into input field for quick re-check
            document.getElementById("endpoint-url").value = url;
            document.getElementById("monitor-section").scrollIntoView({ behavior: 'smooth' });
        };
        
        item.innerHTML = `
            <div class="endpoint-info">
                <span class="endpoint-url" title="${url}">${url}</span>
                <span class="endpoint-meta">Uptime: ${stats.uptime_percentage}% | Latency: ${stats.avg_response_time_ms}ms</span>
            </div>
            <div class="endpoint-badge-status ${badgeClass}">
                <span class="dot ${statusBadge === 'UP' ? 'dot-up' : statusBadge === 'SLOW' ? 'dot-slow' : 'dot-down'}"></span>
                ${statusBadge}
            </div>
        `;
        container.appendChild(item);
    });
}

/* --- 8. Populate Chart.js Response Graphs --- */
function updateChart(historyList) {
    const ctx = document.getElementById("latencyChart");
    if (!ctx) return;
    
    // Get last 15 successful or checked values in standard chronological order (oldest first)
    const chartLogs = [...historyList].slice(0, 15).reverse();
    
    const labels = chartLogs.map(log => {
        // Output just the time part of the timestamp (HH:MM:SS)
        if (!log.timestamp) return "";
        const parts = log.timestamp.split(" ");
        return parts.length > 1 ? parts[1] : log.timestamp;
    });
    
    const dataValues = chartLogs.map(log => log.response_time_ms);
    const pointColors = chartLogs.map(log => {
        if (log.status === "UP") return "#7ac493";
        if (log.status === "SLOW") return "#fcd34d";
        return "#e07a7a";
    });
    
    if (latencyChartInstance) {
        // Update existing chart dataset
        latencyChartInstance.data.labels = labels;
        latencyChartInstance.data.datasets[0].data = dataValues;
        latencyChartInstance.data.datasets[0].pointBackgroundColor = pointColors;
        latencyChartInstance.data.datasets[0].pointBorderColor = pointColors;
        latencyChartInstance.update();
    } else {
        // Create new chart instance
        latencyChartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [{
                    label: "Response Latency",
                    data: dataValues,
                    borderColor: "#c3e38c",
                    borderWidth: 2,
                    tension: 0.35, // Organic curve
                    pointBackgroundColor: pointColors,
                    pointBorderColor: pointColors,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    backgroundColor: (context) => {
                        const chart = context.chart;
                        const {ctx, chartArea} = chart;
                        if (!chartArea) return null;
                        
                        // Add nice subtle vertical gradient matching the Dribbble aesthetic
                        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                        gradient.addColorStop(0, "rgba(195, 227, 140, 0.12)");
                        gradient.addColorStop(1, "rgba(195, 227, 140, 0)");
                        return gradient;
                    }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: "#131614",
                        titleColor: "#f5f4f0",
                        bodyColor: "#8c9590",
                        borderColor: "rgba(255,255,255,0.08)",
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `Latency: ${context.parsed.y} ms`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: "#59615c",
                            font: { family: "Outfit", size: 10 }
                        }
                    },
                    y: {
                        grid: {
                            color: "rgba(255, 255, 255, 0.03)"
                        },
                        ticks: {
                            color: "#59615c",
                            font: { family: "Outfit", size: 10 },
                            callback: function(value) {
                                return value + "ms";
                            }
                        }
                    }
                }
            }
        });
    }
}

/* --- 9. Populate logs history table --- */
function updateLogsTable(historyList) {
    const tbody = document.getElementById("logs-table-body");
    tbody.innerHTML = "";
    
    if (!historyList || historyList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-table">No historical logs available. Check an endpoint url first.</td></tr>`;
        return;
    }
    
    historyList.forEach((log, index) => {
        const row = document.createElement("tr");
        
        let statusBadgeClass = "badge-up";
        let statusDotClass = "dot-up";
        if (log.status === "SLOW") {
            statusBadgeClass = "badge-slow";
            statusDotClass = "dot-slow";
        } else if (log.status === "DOWN") {
            statusBadgeClass = "badge-down";
            statusDotClass = "dot-down";
        } else if (log.status === "HTTP_ERROR") {
            statusBadgeClass = "badge-slow";
            statusDotClass = "dot-slow";
        } else if (log.status === "SERVER_ERROR") {
            statusBadgeClass = "badge-down";
            statusDotClass = "dot-down";
        } else if (log.status === "REDIRECT") {
            statusBadgeClass = "badge-up";
            statusDotClass = "dot-up";
        }
        
        const sizeKb = log.response_size_bytes 
            ? (log.response_size_bytes / 1024).toFixed(2) + " KB"
            : "0 B";
            
        const codeText = log.status_code !== null ? log.status_code : "ERR";
        const latencyText = log.response_time_ms > 0 ? log.response_time_ms + "ms" : "--";
        
        // Truncate timestamp for cleaner layout
        const timeStr = log.timestamp ? log.timestamp.split(" ")[1] : "--:--:--";
        
        row.innerHTML = `
            <td>${timeStr}</td>
            <td>
                <span class="endpoint-badge-status ${statusBadgeClass}" style="padding: 0.15rem 0.5rem; display: inline-flex;">
                    <span class="dot ${statusDotClass}" style="width:6px; height:6px; margin-right:4px;"></span>
                    ${log.status}
                </span>
            </td>
            <td><code>${codeText}</code></td>
            <td class="logs-url-cell" title="${log.url}">${log.url}</td>
            <td>${latencyText}</td>
            <td>${sizeKb}</td>
            <td class="actions-cell">
                <button class="btn-inspect" onclick="inspectLog(${index})" title="Inspect Payload">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

/* --- 10. Inspect Check Log Details --- */
async function inspectLog(index) {
    // Fetch logs to get the items
    try {
        const res = await fetch("/api/history?limit=100");
        const historyList = await res.json();
        
        if (index >= historyList.length) return;
        const log = historyList[index];
        currentSelectedLog = log;
        
        // Populate metadata
        const metadataDiv = document.getElementById("inspector-metadata");
        metadataDiv.innerHTML = `
            <div class="meta-box">
                <div class="meta-box-label">Request URL</div>
                <div class="meta-box-val" style="font-size:0.8rem;">${log.url}</div>
            </div>
            <div class="meta-box">
                <div class="meta-box-label">Timestamp</div>
                <div class="meta-box-val">${log.timestamp || "--"}</div>
            </div>
            <div class="meta-box">
                <div class="meta-box-label">HTTP Code</div>
                <div class="meta-box-val"><code>${log.status_code || "N/A"}</code></div>
            </div>
            <div class="meta-box">
                <div class="meta-box-label">Response Time</div>
                <div class="meta-box-val">${log.response_time_ms} ms</div>
            </div>
            <div class="meta-box">
                <div class="meta-box-label">Response Size</div>
                <div class="meta-box-val">${log.response_size_bytes} bytes</div>
            </div>
            <div class="meta-box">
                <div class="meta-box-label">Content Type</div>
                <div class="meta-box-val">${log.content_type || "N/A"}</div>
            </div>
        `;
        
        // Populate payload preview
        const bodyWrapper = document.getElementById("inspector-body-wrapper");
        const jsonPre = document.getElementById("inspector-json-pre");
        const mimeBadge = document.getElementById("inspector-mime");
        const subtitle = document.getElementById("inspector-subtitle");
        
        subtitle.textContent = "Diagnostic details loaded";
        
        if (log.error) {
            bodyWrapper.style.display = "flex";
            mimeBadge.textContent = "Error Log";
            mimeBadge.style.backgroundColor = "rgba(224, 122, 122, 0.1)";
            mimeBadge.style.color = "var(--status-down)";
            jsonPre.textContent = `Diagnostic Failure Message:\n${log.error}`;
            jsonPre.style.color = "var(--status-down)";
        } else if (log.preview !== null) {
            bodyWrapper.style.display = "flex";
            
            // Set mime text
            let isJson = false;
            if (log.content_type && log.content_type.includes("json")) {
                mimeBadge.textContent = "JSON";
                isJson = true;
                mimeBadge.style.backgroundColor = "rgba(195, 227, 140, 0.1)";
                mimeBadge.style.color = "var(--accent)";
            } else {
                mimeBadge.textContent = "Text Preview";
                isJson = false;
                mimeBadge.style.backgroundColor = "rgba(255,255,255,0.05)";
                mimeBadge.style.color = "var(--text-secondary)";
            }
            
            // Format content body
            if (isJson && typeof log.preview === "object") {
                jsonPre.textContent = JSON.stringify(log.preview, null, 2);
            } else {
                jsonPre.textContent = String(log.preview);
            }
            jsonPre.style.color = "#a7d8a7";
        } else {
            bodyWrapper.style.display = "none";
        }
        
    } catch (err) {
        console.error("Failed to inspect item details", err);
    }
}

function resetInspector() {
    const metadataDiv = document.getElementById("inspector-metadata");
    metadataDiv.innerHTML = `<div class="meta-item-placeholder">Click the "Inspect" icon on any log history item to load HTTP details.</div>`;
    
    document.getElementById("inspector-body-wrapper").style.display = "none";
    document.getElementById("inspector-subtitle").textContent = "Select a log check to inspect payload";
}
