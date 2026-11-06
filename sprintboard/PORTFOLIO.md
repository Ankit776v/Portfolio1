# SprintBoard — portfolio case study

**Category:** Full-stack SaaS / Team Collaboration

**Summary:** A multi-user project management app for planning work across teams, with a Kanban board, deadlines, comments, activity history and role-based access control.

**Stack:** Vanilla JavaScript, HTML/CSS, Node.js, SQLite, REST API, scrypt-based password hashing.

**Highlights:**
- Project ownership and member roles: owner, editor, viewer
- Four-stage Kanban workflow with assignees, priorities and due dates
- Task comments and project activity history
- Session authentication and server-enforced permissions
- Responsive dashboard and project management UI

**Engineering decisions:** A zero-dependency Node.js backend and SQLite keep the demo simple to run and inspect. Parameterized queries reduce SQL injection risks; authorization is checked on the server for project and task operations. Deployment uses persistent disk storage.

**Limitations:** No real-time synchronization, password reset, email invitation delivery, or multi-tenant billing. SQLite is suitable for this single-instance demo but not a horizontally scaled deployment. No automated browser test suite yet.

**Recruiter walkthrough:** Sign in to the demo account, inspect the sample project, move tasks between statuses, add a comment, and review the activity feed. For collaborative role testing, create a second account and invite it from the owner account.

**Links to insert once deployed:**
- Live demo: https://YOUR-SPRINTBOARD-URL
- GitHub source: https://github.com/YOUR-USERNAME/sprintboard
- Portfolio: https://YOUR-PORTFOLIO-URL

**Portfolio card HTML:**
```html
<article class="project-card">
  <h3>SprintBoard — Team Project Management</h3>
  <p>Full-stack Kanban SaaS with authentication, permissions, deadlines and team collaboration.</p>
  <p>Node.js · JavaScript · SQLite · REST APIs</p>
  <a href="https://YOUR-SPRINTBOARD-URL" target="_blank" rel="noopener noreferrer">Live Demo</a>
  <a href="https://github.com/YOUR-USERNAME/sprintboard" target="_blank" rel="noopener noreferrer">Source Code</a>
</article>
```
Replace all placeholders with real URLs. Do not publish demo credentials in source control.
