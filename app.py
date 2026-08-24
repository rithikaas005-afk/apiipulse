import os
from flask import Flask
from routes.api_routes import api_bp

def create_app():
    # Make sure we use the correct template and static folders
    app = Flask(
        __name__,
        template_folder="templates",
        static_folder="static"
    )
    
    # Configure secrets if needed, keep simple for MVP
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "apipulse_secret_key_123")
    
    # Register blueprints
    app.register_blueprint(api_bp)
    
    return app

if __name__ == "__main__":
    app = create_app()
    # Explicitly run on port 5002 as specified. Ensure 5000 and 5001 are not used.
    print("Starting API Pulse Backend server on http://localhost:5002")
    app.run(host="127.0.0.1", port=5002, debug=True)
