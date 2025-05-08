# Strava Activity Downloader

This application allows users to authenticate with their Strava account and download their activities as JSON files.

## Project Structure
- `frontend/`: React.js frontend application
- `backend/`: Python FastAPI backend server

## Setup Instructions

### Backend Setup
1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

3. Set up environment variables:
Create a `.env` file in the backend directory with:
```
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
```

4. Run the backend server:
```bash
uvicorn main:app --reload
```

### Frontend Setup
1. Install dependencies:
```bash
cd frontend
npm install
```

2. Create a `.env` file in the frontend directory with:
```
REACT_APP_API_URL=http://localhost:8000
```

3. Run the frontend development server:
```bash
npm start
```

## Usage
1. Open the application in your browser (default: http://localhost:3000)
2. Click "Connect with Strava" to authenticate
3. Once authenticated, you can view and download your activities

## API Endpoints
- `POST /api/auth/strava`: Authenticate with Strava
- `GET /api/activities`: Get user's activities
- `GET /api/activities/download`: Download activities as JSON 