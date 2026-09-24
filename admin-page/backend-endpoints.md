# Backend API Endpoints Documentation

This document outlines all the backend endpoints used in the Victory Contest Admin Page project.

## Base URL

```
VITE_API_URL (from environment variables)
```

## Authentication Endpoints

### Admin Login

- **Endpoint:** `POST /api/admin/login`
- **Request Body:**
  ```json
  {
    "email": "string",
    "password": "string"
  }
  ```
- **Response:**
  ```json
  {
    "message": "Login successful",
    "admin": {
      "id": "string",
      "name": "string",
      "email": "string",
      "isApproved": "boolean"
    }
  }
  ```
- **Notes:** Uses `withCredentials: true` for cookie-based authentication

### Admin Registration

- **Endpoint:** `POST /api/admin/register`
- **Request Body:**
  ```json
  {
    "data": {
      "name": "string",
      "password": "string",
      "email": "string"
    }
  }
  ```
- **Response:**
  ```json
  {
    "message": "Admin registered successfully"
  }
  ```

### Get All Admins

- **Endpoint:** `GET /api/admin/`
- **Response:**
  ```json
  {
    "admins": [
      {
        "id": "string",
        "name": "string",
        "email": "string",
        "isApproved": "boolean"
      }
    ]
  }
  ```

### Approve Admin

- **Endpoint:** `PUT /api/admin/{email}`
- **Request Body:**
  ```json
  {
    "data": {
      "isApproved": "boolean"
    }
  }
  ```
- **Response:**
  ```json
  {
    "message": "Admin approval status updated"
  }
  ```

### Delete Admin

- **Endpoint:** `DELETE /api/admin/{email}`
- **Response:**
  ```json
  {
    "message": "Admin deleted successfully"
  }
  ```

## Contest Endpoints

### Get All Contests

- **Endpoint:** `GET /api/contest`
- **Response:**
  ```json
  {
    "contests": [
      {
        "id": "string",
        "title": "string",
        "description": "string",
        "start_time": "string",
        "end_time": "string",
        "is_active": "boolean",
        "created_at": "string",
        "updated_at": "string"
      }
    ]
  }
  ```

### Get Contest by ID

- **Endpoint:** `GET /api/contest/{id}`
- **Response:**
  ```json
  {
    "contest": {
      "id": "string",
      "title": "string",
      "description": "string",
      "start_time": "string",
      "end_time": "string",
      "is_active": "boolean",
      "created_at": "string",
      "updated_at": "string"
    }
  }
  ```

### Add Contest

- **Endpoint:** `POST /api/contest/add`
- **Request Body:**
  ```json
  {
    "contest": {
      "title": "string",
      "description": "string",
      "start_time": "string",
      "end_time": "string",
      "is_active": "boolean"
    }
  }
  ```
- **Response:**
  ```json
  {
    "message": "Contest created successfully",
    "contest": {
      "id": "string",
      "title": "string",
      "description": "string",
      "start_time": "string",
      "end_time": "string",
      "is_active": "boolean",
      "created_at": "string",
      "updated_at": "string"
    }
  }
  ```

### Update Contest

- **Endpoint:** `PATCH /api/contest/{id}`
- **Request Body:**
  ```json
  {
    "start_time": "string",
    "end_time": "string"
  }
  ```
- **Response:**
  ```json
  {
    "message": "Contest updated successfully",
    "contest": {
      "id": "string",
      "title": "string",
      "description": "string",
      "start_time": "string",
      "end_time": "string",
      "is_active": "boolean",
      "created_at": "string",
      "updated_at": "string"
    }
  }
  ```

### Delete Contest

- **Endpoint:** `DELETE /api/contest/delete/{contest_id}`
- **Response:**
  ```json
  {
    "message": "Contest deleted successfully"
  }
  ```

### Announce Contest

- **Endpoint:** `POST /api/contest/announce`
- **Request Body:** `FormData`
  ```
  contest: JSON string of contest object
  message: string
  file: File (optional)
  ```
- **Headers:**
  ```
  Content-Type: multipart/form-data
  ```
- **Response:**
  ```json
  {
    "message": "Contest announced successfully"
  }
  ```

## Question Endpoints

### Get All Questions

- **Endpoint:** `GET /api/question/`
- **Response:**
  ```json
  {
    "questions": [
      {
        "id": "string",
        "question_text": "string",
        "question_image": "string",
        "multiple_choice": ["string"],
        "correct_answer": "string",
        "explanation": "string",
        "explanation_image": "string",
        "difficulty": "string",
        "category": "string",
        "created_at": "string",
        "updated_at": "string"
      }
    ]
  }
  ```

### Add Single Question

- **Endpoint:** `POST /api/question/addquestion`
- **Request Body:** `FormData`
  ```
  question_text: string
  question_image: File (optional)
  multiple_choice: string[] (multiple entries)
  correct_answer: string
  explanation: string
  explanation_image: File (optional)
  difficulty: string
  category: string
  ```
- **Headers:**
  ```
  Content-Type: multipart/form-data
  ```
- **Response:**
  ```json
  {
    "message": "Question added successfully",
    "question": {
      "id": "string",
      "question_text": "string",
      "question_image": "string",
      "multiple_choice": ["string"],
      "correct_answer": "string",
      "explanation": "string",
      "explanation_image": "string",
      "difficulty": "string",
      "category": "string",
      "created_at": "string",
      "updated_at": "string"
    }
  }
  ```

### Update Question

- **Endpoint:** `PUT /api/question/updatequestion/{id}`
- **Request Body:** `FormData`
  ```
  question_text: string
  question_image: File (optional)
  multiple_choice: string[] (multiple entries)
  correct_answer: string
  explanation: string
  explanation_image: File (optional)
  difficulty: string
  category: string
  ```
- **Headers:**
  ```
  Content-Type: multipart/form-data
  ```
- **Response:**
  ```json
  {
    "message": "Question updated successfully",
    "question": {
      "id": "string",
      "question_text": "string",
      "question_image": "string",
      "multiple_choice": ["string"],
      "correct_answer": "string",
      "explanation": "string",
      "explanation_image": "string",
      "difficulty": "string",
      "category": "string",
      "created_at": "string",
      "updated_at": "string"
    }
  }
  ```

### Delete Question

- **Endpoint:** `DELETE /api/question/deletequestion/{id}`
- **Response:**
  ```json
  {
    "message": "Question deleted successfully"
  }
  ```

## Student Endpoints

### Get All Students

- **Endpoint:** `GET /api/student/`
- **Response:**
  ```json
  {
    "message": [
      {
        "id": "string",
        "name": "string",
        "email": "string",
        "student_id": "string",
        "created_at": "string",
        "updated_at": "string"
      }
    ]
  }
  ```

### Delete Student

- **Endpoint:** `DELETE /api/student/{id}`
- **Parameters:**
  - `id` (path parameter): The ID of the student to delete
- **Response:**
  ```json
  {
    "message": "Student deleted successfully"
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: Student ID is required
  - `404 Not Found`: Student not found
  - `500 Internal Server Error`: Failed to delete student

## Submission Endpoints

### Get Submissions by Contest

- **Endpoint:** `GET /api/submission/contest_id/{id}`
- **Response:**
  ```json
  {
    "submissions": [
      {
        "id": "string",
        "student_id": "string",
        "contest_id": "string",
        "question_id": "string",
        "answer": "string",
        "is_correct": "boolean",
        "score": "number",
        "submitted_at": "string",
        "created_at": "string",
        "updated_at": "string"
      }
    ]
  }
  ```

## Data Models

### Contest Model

```typescript
interface Contest {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### Question Model

```typescript
interface Question {
  id: string;
  question_text: string;
  question_image?: string;
  multiple_choice: string[];
  correct_answer: string;
  explanation: string;
  explanation_image?: string;
  difficulty: string;
  category: string;
  created_at: string;
  updated_at: string;
}
```

### Student Model

```typescript
interface Student {
  id: string;
  name: string;
  email: string;
  student_id: string;
  created_at: string;
  updated_at: string;
}
```

### Submission Model

```typescript
interface Submission {
  id: string;
  student_id: string;
  contest_id: string;
  question_id: string;
  answer: string;
  is_correct: boolean;
  score: number;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}
```

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "error": "string",
  "message": "string",
  "statusCode": "number"
}
```

Common HTTP status codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## Notes

1. **Authentication:** The login endpoint uses `withCredentials: true` to handle cookie-based authentication.

2. **File Uploads:** Questions with images are sent as `FormData` with `multipart/form-data` content type.

3. **Bulk Operations:** The `addMultipleQuestions` function iterates through questions and calls the single question endpoint for each one.

4. **Environment Variables:** The base URL is configured via `VITE_API_URL` environment variable.

5. **Error Handling:** The frontend includes error handling for failed requests, particularly in bulk operations where individual failures don't stop the entire process.
