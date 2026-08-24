import threading

class HistoryStore:
    def __init__(self, max_size_per_url=100, max_global_size=1000):
        self.lock = threading.Lock()
        self.history = []  # List of all checks
        self.max_size_per_url = max_size_per_url
        self.max_global_size = max_global_size
        
    def add_check(self, check_result):
        """
        Adds a check result to the history in a thread-safe manner.
        Prunes old entries if limits are exceeded.
        """
        with self.lock:
            self.history.append(check_result)
            
            # Prune global history if it gets too large
            if len(self.history) > self.max_global_size:
                self.history = self.history[-self.max_global_size:]
                
    def get_history(self, limit=100, url=None):
        """
        Returns recent check history. Optional filtering by URL.
        """
        with self.lock:
            # Copy to prevent modification during iteration
            logs = list(self.history)
            
        if url:
            logs = [log for log in logs if log["url"] == url]
            
        # Return most recent first
        return list(reversed(logs))[:limit]
        
    def get_summary(self, url=None):
        """
        Calculates performance summary (uptime, avg/min/max response times).
        If url is provided, returns statistics for that URL only.
        Otherwise returns global statistics across all monitored URLs.
        """
        with self.lock:
            logs = list(self.history)
            
        if url:
            logs = [log for log in logs if log["url"] == url]
            
        total_checks = len(logs)
        if total_checks == 0:
            return {
                "total_checks": 0,
                "successful_checks": 0,
                "failed_checks": 0,
                "uptime_percentage": 0.0,
                "avg_response_time_ms": 0.0,
                "min_response_time_ms": 0.0,
                "max_response_time_ms": 0.0
            }
            
        # "Reachable" statuses: server responded (even with an HTTP error code)
        # Only DOWN (network failure, DNS, timeout) is truly "failed"
        REACHABLE_STATUSES = ("UP", "SLOW", "REDIRECT", "HTTP_ERROR", "SERVER_ERROR")
        successful_checks = sum(1 for log in logs if log["status"] in REACHABLE_STATUSES)
        failed_checks = total_checks - successful_checks
        uptime_percentage = round((successful_checks / total_checks) * 100, 2)
        
        # Calculate response times for successful checks (or all checks? The prompt says response times are response time metrics. Let's base it on successful checks to avoid down/timeout skewing, or let's use all checks. Standard is all checks where response time > 0, or simply all logs. Let's use all logs that actually successfully connected (status_code is not None or status != DOWN). Wait, if a request timed out it might have response_time_ms = 10000. Let's include all checks that have a response_time_ms recorded to make sure it is accurate.)
        response_times = [log["response_time_ms"] for log in logs if log["response_time_ms"] is not None]
        
        if response_times:
            avg_time = round(sum(response_times) / len(response_times), 1)
            min_time = min(response_times)
            max_time = max(response_times)
        else:
            avg_time = 0.0
            min_time = 0.0
            max_time = 0.0
            
        return {
            "total_checks": total_checks,
            "successful_checks": successful_checks,
            "failed_checks": failed_checks,
            "uptime_percentage": uptime_percentage,
            "avg_response_time_ms": avg_time,
            "min_response_time_ms": min_time,
            "max_response_time_ms": max_time
        }

    def get_all_summaries(self):
        """
        Returns a dictionary of summaries grouped by URL, plus a global summary.
        """
        with self.lock:
            logs = list(self.history)
            
        # Get unique URLs
        urls = list(set(log["url"] for log in logs))
        
        url_summaries = {}
        for url in urls:
            url_summaries[url] = self.get_summary(url=url)
            
        global_summary = self.get_summary()
        
        return {
            "global": global_summary,
            "by_url": url_summaries
        }
        
    def clear_history(self):
        with self.lock:
            self.history.clear()
