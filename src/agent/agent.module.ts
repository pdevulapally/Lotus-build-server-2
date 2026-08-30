import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentRunsService } from './agent-runs.service';
import { AgentLoopService } from './agent-loop.service';
import { AgentEventsService } from './agent-events.service';
import { SandboxService } from './sandbox/sandbox.service';
import { ToolRegistryService } from './tools/tool-registry.service';
import { BashTool } from './tools/bash.tool';
import { ListFilesTool, ReadFileTool, WriteFileTool } from './tools/fs.tools';

@Module({
  controllers: [AgentController],
  providers: [
    AgentRunsService,
    AgentLoopService,
    AgentEventsService,
    SandboxService,
    ToolRegistryService,
    ReadFileTool,
    WriteFileTool,
    ListFilesTool,
    BashTool,
  ],
})
export class AgentModule {}
