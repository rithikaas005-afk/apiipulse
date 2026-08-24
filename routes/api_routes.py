import time
from flask import Blueprint, request, jsonify, render_template
from concurrent.futures import ThreadPoolExecutor
from services.api_monitor import ApiMonitorService
from services.history_store import HistoryStore

api_bp = Blueprint("api", __name__)
history_store = HistoryStore()
executor = ThreadPoolExecutor(max_workers=10)

@api_bp.route("/")
def index():
    """
    Renders the dashboard.
    """
    return render_template("index.html")

@api_bp.route("/api/health", methods=["GET"])
def health():
    """
    Service health check endpoint.
    """
    return jsonify({
        "status": "healthy",
        "service": "API Pulse"
    })

@api_bp.route("/api/check", methods=["POST"])
def check_url():
    """
    Checks a single API endpoint.
    Accepts JSON body: { "url": "...", "threshold_ms": 1000 }
    """
    data = request.get_json() or {}
    url = data.get("url")
    threshold_ms = data.get("threshold_ms", 1000)
    
    # Simple type validation for threshold
    try:
        threshold_ms = int(threshold_ms)
    except (ValueError, TypeError):
        threshold_ms = 1000
        
    if not url:
        return jsonify({
            "error": "URL parameter is required"
        }), 400
        
    # Validate the URL structure before processing
    is_valid, validation_err = ApiMonitorService.validate_url(url)
    if not is_valid:
        # Save validation failures to history as DOWN, using simple timestamp
        result = {
            "url": url,
            "status": "DOWN",
            "status_code": None,
            "response_time_ms": 0,
            "response_size_bytes": 0,
            "content_type": "text/plain",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "error": validation_err,
            "preview": None
        }
        history_store.add_check(result)
        return jsonify(result), 400
        
    result = ApiMonitorService.perform_check(url, threshold_ms)
    history_store.add_check(result)
    return jsonify(result)

@api_bp.route("/api/check-multiple", methods=["POST"])
def check_multiple_urls():
    """
    Checks multiple API endpoints concurrently.
    Accepts JSON body: { "urls": ["...", "..."], "threshold_ms": 1000 }
    """
    data = request.get_json() or {}
    urls = data.get("urls")
    threshold_ms = data.get("threshold_ms", 1000)
    
    try:
        threshold_ms = int(threshold_ms)
    except (ValueError, TypeError):
        threshold_ms = 1000
        
    if not urls or not isinstance(urls, list):
        return jsonify({
            "error": "urls parameter must be a non-empty list"
        }), 400
        
    # Use ThreadPoolExecutor to check URLs concurrently
    futures = []
    for url in urls:
        futures.append(executor.submit(ApiMonitorService.perform_check, url, threshold_ms))
        
    results = []
    for future in futures:
        try:
            res = future.result()
            history_store.add_check(res)
            results.append(res)
        except Exception as e:
            # Catch unexpected errors to ensure one failure doesn't crash the list
            results.append({
                "url": "unknown",
                "status": "DOWN",
                "status_code": None,
                "response_time_ms": 0,
                "response_size_bytes": 0,
                "content_type": "text/plain",
                "timestamp": "",
                "error": f"Executor Exception: {str(e)}",
                "preview": None
            })
            
    return jsonify({
        "checks": results
    })

@api_bp.route("/api/history", methods=["GET"])
def get_history():
    """
    Retrieves checked APIs history.
    Query params:
      - limit: number of records to return (default 100)
      - url: filter by specific URL (optional)
    """
    limit = request.args.get("limit", 100)
    url = request.args.get("url")
    
    try:
        limit = int(limit)
    except ValueError:
        limit = 100
        
    logs = history_store.get_history(limit=limit, url=url)
    return jsonify(logs)

@api_bp.route("/api/summary", methods=["GET"])
def get_summary():
    """
    Retrieves global summary and summaries grouped by URL.
    """
    summaries = history_store.get_all_summaries()
    return jsonify(summaries)

@api_bp.route("/api/clear", methods=["POST"])
def clear_history():
    """
    Clears all history. Useful for resets during testing.
    """
    history_store.clear_history()
    return jsonify({"status": "success", "message": "History cleared"})
