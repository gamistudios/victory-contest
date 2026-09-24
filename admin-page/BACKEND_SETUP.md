# Backend Setup Guide

## Contest Backend Go Integration

This admin panel has been updated to use the `contest-backend-go` backend instead of the previous backend.

### Configuration

1. **Set Environment Variable**: Create a `.env` file in the root directory with:

   ```
   VITE_API_URL=http://localhost:8081
   ```

2. **Update Backend URL**: If your backend runs on a different port or host, update the `VITE_API_URL` accordingly.

### Backend Requirements

The backend should be running and accessible at the configured URL. Make sure the following endpoints are available:

- `GET /api/contest/:id` - Get contest by ID
- `PATCH /api/contest/:id` - Update contest
- `DELETE /api/contest/delete/:id` - Delete contest
- `POST /api/contest/announce/:id` - Announce contest
- `GET /api/student/grades-and-schools` - Get schools and cities for filters
- `GET /api/submission/contest/:id` - Get submissions for a contest

### Running the Backend

1. Navigate to the `contest-backend-go` directory
2. Run `go mod tidy` to install dependencies
3. Run `go run main.go` to start the server
4. The server should start on port 8081 by default

### Features Updated

- ✅ Contest update functionality now works with contest-backend-go
- ✅ Date and time display shows full date and year (not just time)
- ✅ School and city filters are now functional with real data
- ✅ All Material-UI components replaced with shadcn/ui components
- ✅ Improved UI with better cards, tables, and responsive design
- ✅ Better error handling and user feedback with toast notifications

### Troubleshooting

- If you get CORS errors, ensure the backend allows requests from your frontend origin
- Check that all required environment variables are set
- Verify the backend is running and accessible at the configured URL
