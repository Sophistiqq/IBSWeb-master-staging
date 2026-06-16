## 🛠️ Specialized Tools

### 1. Code Oracle (`search_code_context`)
Deep-dives into MSAP C# methods. Fetches method body plus DTO, Model, and Enum definitions.
- **Example**: `search_code_context(methodName: "CreateJobOrderAsync")`

### 2. Logic Mapper (`trace_workflow`)
Recursively maps the execution path from Controller ⮕ Service ⮕ Repository for the MSAP workflow.
- **Example**: `trace_workflow(methodName: "BillDispatchTickets", filePath: "IBSWeb/Areas/User/Controllers/BillingController.cs")`

### 3. Action Analyst (`analyze_action`)
Deep-dives into a specific Controller Action, showing dependencies and related DTOs.
- **Example**: `analyze_action(methodName: "Index", filePath: "IBSWeb/Areas/User/Controllers/JobOrderController.cs")`

### 4. Model Inspector (`read_model`)
Provides a concise summary of MSAP Models or DTOs.
- **Example**: `read_model(modelName: "JobOrderViewModel")`

### 5. Data Guardian (`execute_sql`)
Direct access to the MSAP PostgreSQL database. **Prompt on Write** is enforced.
- **Example**: `execute_sql(sql: "SELECT * FROM public.msap_job_orders LIMIT 10")`

### 6. Build Guard (`check_build_status`)
Runs `dotnet build` to ensure IBS integrity.
