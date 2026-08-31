-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
