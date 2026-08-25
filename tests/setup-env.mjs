process.env.NODE_ENV ||= "test";
process.env.DATABASE_URL ||= "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET ||= "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL ||= "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL ||= "https://api.example.test/media";
process.env.UPLOADS_DIR ||= "./uploads-test";
