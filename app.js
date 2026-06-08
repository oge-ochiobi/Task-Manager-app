(function () {
  "use strict";

  /* ============================================================
     State
     ============================================================ */
  const STORAGE_KEY = "focuslist_data";

  const DEFAULT_STATE = {
    projects: [
      { id: "proj_default", name: "General", color: "#6366f1" },
    ],
    tags: [],
    tasks: [],
    user: { name: "User", joined: new Date().toISOString().slice(0, 10) },
    focus: { running: false, startTime: null, elapsed: 0 },
    streaks: { current: 0, longest: 0, lastDate: null },
    viewMode: "kanban",
    selectedProject: "all",
    selectedTag: "all",
    selectedStatus: "all",
    sortBy: "created-desc",
  };

  let state;

  /* ============================================================
     DOM refs
     ============================================================ */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];

  const dom = {};

  function cacheDom() {
    dom.sidebar = $("#sidebar");
    dom.profileName = $("#profile-name");
    dom.profileJoined = $("#profile-joined");
    dom.profileEditBtn = $("#profile-edit-btn");
    dom.projectList = $("#project-list");
    dom.addProjectBtn = $("#add-project-btn");
    dom.tagCloud = $("#tag-cloud");
    dom.addTagBtn = $("#add-tag-btn");
    dom.sidebarStatusList = $("#sidebar-status-list");
    dom.contextButtons = $("#context-buttons");
    dom.globalSearch = $("#global-search");
    dom.viewToggle = $("#view-toggle");
    dom.quickAddForm = $("#quick-add-form");
    dom.quickAddInput = $("#quick-add-input");
    dom.quickAddProject = $("#quick-add-project");
    dom.quickAddPriority = $("#quick-add-priority");
    dom.quickAddBtn = $("#quick-add-btn");
    dom.sortSelect = $("#sort-select");
    dom.boardContainer = $("#board-container");
    dom.progressFill = $("#progress-bar-fill");
    dom.progressText = $("#progress-text");
    dom.timerDisplay = $("#timer-display");
    dom.timerStartBtn = $("#timer-start-btn");
    dom.timerResetBtn = $("#timer-reset-btn");
    dom.currentStreak = $("#current-streak");
    dom.longestStreak = $("#longest-streak");
  }

  /* ============================================================
     Persistence
     ============================================================ */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = deepMerge(clone(DEFAULT_STATE), parsed);
        return;
      }
    } catch (_) { /* ignore */ }
    state = clone(DEFAULT_STATE);
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) { /* ignore */ }
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function deepMerge(target, source) {
    const out = clone(target);
    for (const key of Object.keys(source)) {
      if (key in out && typeof out[key] === "object" && out[key] !== null && !Array.isArray(out[key])) {
        out[key] = deepMerge(out[key], source[key]);
      } else {
        out[key] = clone(source[key]);
      }
    }
    return out;
  }

  /* ============================================================
     Helpers
     ============================================================ */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function today() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
  }

  /* ============================================================
     Derived data
     ============================================================ */
  function getFilteredTasks() {
    let result = [...state.tasks];

    // Status
    if (state.selectedStatus === "todo") result = result.filter((t) => t.status === "todo");
    else if (state.selectedStatus === "in_progress") result = result.filter((t) => t.status === "in_progress");
    else if (state.selectedStatus === "done") result = result.filter((t) => t.status === "done");

    // Project
    if (state.selectedProject !== "all") result = result.filter((t) => t.projectId === state.selectedProject);

    // Tag
    if (state.selectedTag !== "all") result = result.filter((t) => t.tags.includes(state.selectedTag));

    // Search
    const q = dom.globalSearch.value.trim().toLowerCase();
    if (q) result = result.filter((t) => t.title.toLowerCase().includes(q));

    // Sort
    result = sortTasks(result, state.sortBy);

    return result;
  }

  function sortTasks(taskList, sortBy) {
    const arr = [...taskList];
    switch (sortBy) {
      case "created-desc":
        arr.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case "created-asc":
        arr.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case "priority": {
        const order = { high: 0, medium: 1, low: 2 };
        arr.sort((a, b) => order[a.priority] - order[b.priority] || b.createdAt - a.createdAt);
        break;
      }
      case "due-date":
        arr.sort((a, b) => {
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate) || b.createdAt - a.createdAt;
        });
        break;
    }
    return arr;
  }

  function getTasksByStatus(status) {
    return getFilteredTasks().filter((t) => t.status === status);
  }

  function getProject(id) {
    return state.projects.find((p) => p.id === id);
  }

  function getTagLabel(tagId) {
    const t = state.tags.find((tg) => tg.id === tagId);
    return t ? t.name : tagId;
  }

  /* ============================================================
     Metrics
     ============================================================ */
  function updateMetrics() {
    const total = state.tasks.length;
    const done = state.tasks.filter((t) => t.status === "done").length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    dom.progressFill.style.width = pct + "%";
    dom.progressText.textContent = `${done} / ${total} tasks done (${pct}%)`;
  }

  /* ============================================================
     Streaks
     ============================================================ */
  function updateStreaks() {
    dom.currentStreak.textContent = state.streaks.current;
    dom.longestStreak.textContent = state.streaks.longest;
  }

  function checkStreak() {
    const todayStr = today();
    const doneToday = state.tasks.some(
      (t) => t.status === "done" && t.completedAt && t.completedAt.startsWith(todayStr)
    );

    if (doneToday) {
      if (state.streaks.lastDate === todayStr) {
        // already counted today
        return;
      }
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);
      if (state.streaks.lastDate === yStr || state.streaks.lastDate === null) {
        state.streaks.current += 1;
      } else {
        state.streaks.current = 1;
      }
      state.streaks.lastDate = todayStr;
      if (state.streaks.current > state.streaks.longest) {
        state.streaks.longest = state.streaks.current;
      }
      saveState();
      updateStreaks();
    }
  }

  /* ============================================================
     Render
     ============================================================ */
  function render() {
    if (state.viewMode === "kanban") renderKanban();
    else renderGrid();

    updateMetrics();
    updateStreaks();
    updateProjectSelects();
  }

  function renderKanban() {
    const board = dom.boardContainer;
    board.className = "board-container kanban-view";
    board.innerHTML = "";

    const columns = [
      { key: "todo", label: "To Do" },
      { key: "in_progress", label: "In Progress" },
      { key: "done", label: "Done" },
    ];

    for (const col of columns) {
      const tpl = document.getElementById("kanban-column-template");
      const clone = tpl.content.cloneNode(true);
      const columnEl = clone.querySelector(".kanban-column");
      columnEl.dataset.status = col.key;

      const title = clone.querySelector(".kanban-column-title");
      title.textContent = col.label;

      const body = clone.querySelector(".kanban-column-body");

      renderColumnTasks(col.key, body);

      // Drag events on column body
      body.addEventListener("dragover", handleDragOver);
      body.addEventListener("dragenter", handleDragEnter);
      body.addEventListener("dragleave", handleDragLeave);
      body.addEventListener("drop", handleDrop);

      const count = clone.querySelector(".kanban-column-count");
      const taskCount = getTasksByStatus(col.key).length;
      count.textContent = taskCount;

      board.appendChild(clone);
    }
  }

  function renderColumnTasks(status, bodyEl) {
    const tasksInCol = getTasksByStatus(status);
    bodyEl.innerHTML = "";

    if (tasksInCol.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-column";
      empty.textContent = "No tasks";
      bodyEl.appendChild(empty);
      return;
    }

    for (const task of tasksInCol) {
      const card = createTaskCardElement(task);
      bodyEl.appendChild(card);
    }
  }

  function renderGrid() {
    const board = dom.boardContainer;
    board.className = "board-container grid-view";
    board.innerHTML = "";

    const filtered = getFilteredTasks();
    if (filtered.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-column";
      empty.style.gridColumn = "1 / -1";
      empty.textContent = "No tasks match your filters.";
      board.appendChild(empty);
      return;
    }

    for (const task of filtered) {
      const card = createTaskCardElement(task);
      board.appendChild(card);
    }
  }

  function createTaskCardElement(task) {
    const tpl = document.getElementById("task-card-template");
    const clone = tpl.content.cloneNode(true);
    const card = clone.querySelector(".task-card");
    card.dataset.taskId = task.id;
    if (task.status === "done") card.classList.add("done");

    // Drag
    card.setAttribute("draggable", "true");
    card.addEventListener("dragstart", handleDragStart);
    card.addEventListener("dragend", handleDragEnd);

    // Project badge
    const badge = clone.querySelector(".card-project-badge");
    const proj = getProject(task.projectId);
    if (proj) {
      badge.textContent = proj.name;
      badge.style.background = proj.color + "22";
      badge.style.color = proj.color;
    } else {
      badge.style.display = "none";
    }

    // Priority dot
    const dot = clone.querySelector(".card-priority-dot");
    dot.classList.add("priority-" + task.priority);

    // Title
    const titleEl = clone.querySelector(".card-title");
    titleEl.textContent = task.title;

    // Tags
    const tagsEl = clone.querySelector(".card-tags");
    if (task.tags.length > 0) {
      for (const tagId of task.tags) {
        const span = document.createElement("span");
        span.className = "card-tag";
        span.textContent = getTagLabel(tagId);
        tagsEl.appendChild(span);
      }
    } else {
      tagsEl.style.display = "none";
    }

    // Meta
    const dueEl = clone.querySelector(".card-due-date");
    if (task.dueDate) {
      const d = new Date(task.dueDate);
      dueEl.textContent = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const isOverdue = task.status !== "done" && new Date(task.dueDate) < new Date(new Date().toDateString());
      if (isOverdue) dueEl.style.color = "var(--color-danger)";
    } else {
      dueEl.style.display = "none";
    }

    const subtaskCountEl = clone.querySelector(".card-subtask-count");
    const subs = task.subtasks || [];
    const doneSubs = subs.filter((s) => s.completed).length;
    if (subs.length > 0) {
      subtaskCountEl.textContent = `${doneSubs}/${subs.length} subtasks`;
    } else {
      subtaskCountEl.style.display = "none";
    }

    // Subtask section
    const subtaskSection = clone.querySelector(".subtask-section");
    const subtaskList = subtaskSection.querySelector(".subtask-items");
    const toggleBtn = subtaskSection.querySelector(".subtask-toggle-btn");
    const subtaskContainer = subtaskSection.querySelector(".subtask-list");
    const addSubForm = subtaskSection.querySelector(".subtask-add-form");
    const addSubInput = subtaskSection.querySelector(".subtask-add-input");
    const addSubSubmit = subtaskSection.querySelector(".subtask-add-submit");

    function renderSubtasks() {
      subtaskList.innerHTML = "";
      for (const sub of subs) {
        const li = document.createElement("li");
        li.className = "subtask-item";
        if (sub.completed) li.classList.add("done");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = sub.completed;
        cb.addEventListener("change", () => {
          sub.completed = cb.checked;
          saveState();
          renderSubtasks();
          checkStreak();
        });
        const label = document.createElement("label");
        label.textContent = sub.title;
        label.addEventListener("click", () => {
          cb.checked = !cb.checked;
          sub.completed = cb.checked;
          saveState();
          renderSubtasks();
          checkStreak();
        });
        const delBtn = document.createElement("button");
        delBtn.className = "subtask-delete";
        delBtn.textContent = "x";
        delBtn.addEventListener("click", () => {
          task.subtasks = task.subtasks.filter((s) => s.id !== sub.id);
          saveState();
          renderSubtasks();
          render();
        });
        li.appendChild(cb);
        li.appendChild(label);
        li.appendChild(delBtn);
        subtaskList.appendChild(li);
      }
    }

    toggleBtn.addEventListener("click", () => {
      const isHidden = subtaskContainer.style.display === "none";
      subtaskContainer.style.display = isHidden ? "block" : "none";
      toggleBtn.textContent = isHidden ? "\u25BC Subtasks" : "\u25B6 Subtasks";
    });

    addSubForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = addSubInput.value.trim();
      if (!val) return;
      task.subtasks.push({ id: uid(), title: val, completed: false });
      addSubInput.value = "";
      saveState();
      renderSubtasks();
      render();
    });

    renderSubtasks();

    // Delete button
    const deleteBtn = clone.querySelector(".card-delete-btn");
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.tasks = state.tasks.filter((t) => t.id !== task.id);
      saveState();
      render();
    });

    // Click to edit title inline
    titleEl.addEventListener("dblclick", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = task.title;
      input.className = "card-title-input";
      input.style.cssText = "font-size:0.875rem;width:100%;border:1px solid var(--blue-300);border-radius:4px;padding:0.2rem 0.4rem;outline:none;";
      titleEl.replaceWith(input);
      input.focus();
      input.select();
      input.addEventListener("blur", finishEdit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") finishEdit();
        if (e.key === "Escape") { input.value = task.title; finishEdit(); }
      });
      function finishEdit() {
        const val = input.value.trim();
        if (val) task.title = val;
        saveState();
        render();
      }
    });

    return card;
  }

  /* ============================================================
     Drag & Drop
     ============================================================ */
  let dragData = null;

  function handleDragStart(e) {
    const card = e.target.closest(".task-card");
    if (!card) return;
    dragData = card.dataset.taskId;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragData);
  }

  function handleDragEnd(e) {
    const card = e.target.closest(".task-card");
    if (card) card.classList.remove("dragging");
    $$(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDragEnter(e) {
    e.preventDefault();
    const body = e.target.closest(".kanban-column-body");
    if (body) body.classList.add("drag-over");
  }

  function handleDragLeave(e) {
    const body = e.target.closest(".kanban-column-body");
    if (body && !body.contains(e.relatedTarget)) {
      body.classList.remove("drag-over");
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    $$(".drag-over").forEach((el) => el.classList.remove("drag-over"));
    const body = e.target.closest(".kanban-column-body");
    if (!body || !dragData) return;
    const column = body.closest(".kanban-column");
    if (!column) return;
    const newStatus = column.dataset.status;
    const task = state.tasks.find((t) => t.id === dragData);
    if (!task) return;
    if (task.status !== newStatus) {
      task.status = newStatus;
      if (newStatus === "done") {
        task.completedAt = new Date().toISOString();
      } else {
        task.completedAt = null;
      }
      saveState();
      checkStreak();
      render();
    }
    dragData = null;
  }

  /* ============================================================
     Project & Tag management
     ============================================================ */
  function updateProjectSelects() {
    const selects = [dom.quickAddProject];
    for (const sel of selects) {
      const val = sel.value;
      sel.innerHTML = '<option value="">No project</option>';
      for (const p of state.projects) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
      }
      sel.value = val || "";
    }
  }

  function renderProjects() {
    const list = dom.projectList;
    list.innerHTML = '<li class="project-item active" data-project="all"><span class="project-dot" style="background:#6366f1"></span><span>All Tasks</span></li>';
    for (const proj of state.projects) {
      const li = document.createElement("li");
      li.className = "project-item";
      li.dataset.project = proj.id;
      if (state.selectedProject === proj.id) li.classList.add("active");
      const dot = document.createElement("span");
      dot.className = "project-dot";
      dot.style.background = proj.color;
      const nameSpan = document.createElement("span");
      nameSpan.textContent = proj.name;
      li.appendChild(dot);
      li.appendChild(nameSpan);
      li.addEventListener("click", () => {
        state.selectedProject = proj.id;
        renderProjects();
        render();
        saveState();
      });
      list.appendChild(li);
    }
    // Re-bind "All" click
    const firstLi = list.firstElementChild;
    if (firstLi) {
      firstLi.addEventListener("click", () => {
        state.selectedProject = "all";
        renderProjects();
        render();
        saveState();
      });
    }
  }

  function renderTags() {
    const cloud = dom.tagCloud;
    cloud.innerHTML = '<span class="tag-pill active" data-tag="all">All</span>';
    const allPill = cloud.firstElementChild;
    allPill.addEventListener("click", () => {
      state.selectedTag = "all";
      renderTags();
      render();
      saveState();
    });

    for (const tag of state.tags) {
      const span = document.createElement("span");
      span.className = "tag-pill";
      span.dataset.tag = tag.id;
      if (state.selectedTag === tag.id) span.classList.add("active");
      span.textContent = tag.name;
      span.addEventListener("click", () => {
        state.selectedTag = tag.id;
        renderTags();
        render();
        saveState();
      });
      cloud.appendChild(span);
    }
  }

  /* ============================================================
     Profile editing
     ============================================================ */
  function renderProfile() {
    dom.profileName.textContent = state.user.name;
    const joined = new Date(state.user.joined);
    const now = new Date();
    const days = Math.floor((now - joined) / (86400000));
    dom.profileJoined.textContent = `Joined ${days > 0 ? days + "d ago" : "today"}`;
    // Avatar letter
    const avatar = $("#avatar");
    if (avatar) avatar.textContent = state.user.name.charAt(0).toUpperCase();
  }

  /* ============================================================
     Focus Timer
     ============================================================ */
  let timerInterval = null;

  function renderTimer() {
    dom.timerDisplay.textContent = formatTime(state.focus.elapsed);
    if (state.focus.running) {
      dom.timerStartBtn.textContent = "Pause";
      dom.timerStartBtn.classList.add("timer-btn-active");
    } else {
      dom.timerStartBtn.textContent = "Start";
      dom.timerStartBtn.classList.remove("timer-btn-active");
    }
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    state.focus.running = true;
    state.focus.startTime = Date.now() - state.focus.elapsed * 1000;
    timerInterval = setInterval(() => {
      state.focus.elapsed = Math.floor((Date.now() - state.focus.startTime) / 1000);
      dom.timerDisplay.textContent = formatTime(state.focus.elapsed);
    }, 200);
    saveState();
    renderTimer();
  }

  function pauseTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    state.focus.running = false;
    state.focus.startTime = null;
    saveState();
    renderTimer();
  }

  function resetTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    state.focus.running = false;
    state.focus.startTime = null;
    state.focus.elapsed = 0;
    saveState();
    renderTimer();
  }

  /* ============================================================
     Task CRUD
     ============================================================ */
  function addTask(title, projectId, priority) {
    const task = {
      id: uid(),
      title: title.trim(),
      projectId: projectId || state.projects[0].id,
      tags: [],
      priority: priority || "medium",
      status: "todo",
      createdAt: Date.now(),
      dueDate: null,
      subtasks: [],
      completedAt: null,
    };
    state.tasks.unshift(task);
    saveState();
    render();
  }

  /* ============================================================
     Sidebar status filter
     ============================================================ */
  function renderStatusFilters() {
    $$(".status-filter-btn", dom.sidebarStatusList).forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.status === state.selectedStatus);
    });
  }

  /* ============================================================
     Context switcher
     ============================================================ */
  function renderContextSwitcher() {
    $$(".context-btn", dom.contextButtons).forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === state.viewMode);
    });
  }

  /* ============================================================
     Init / Events
     ============================================================ */
  function init() {
    cacheDom();
    loadState();

    // Profile
    renderProfile();
    dom.profileEditBtn.addEventListener("click", () => {
      const name = prompt("Your name:", state.user.name);
      if (name && name.trim()) {
        state.user.name = name.trim();
        saveState();
        renderProfile();
      }
    });

    // Projects
    renderProjects();
    dom.addProjectBtn.addEventListener("click", () => {
      const name = prompt("Project name:");
      if (name && name.trim()) {
        const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
        const color = colors[state.projects.length % colors.length];
        state.projects.push({ id: uid(), name: name.trim(), color });
        saveState();
        renderProjects();
        updateProjectSelects();
      }
    });

    // Tags
    renderTags();
    dom.addTagBtn.addEventListener("click", () => {
      const name = prompt("Tag name:");
      if (name && name.trim()) {
        state.tags.push({ id: uid(), name: name.trim() });
        saveState();
        renderTags();
      }
    });

    // Status filters
    renderStatusFilters();
    dom.sidebarStatusList.addEventListener("click", (e) => {
      const btn = e.target.closest(".status-filter-btn");
      if (btn) {
        state.selectedStatus = btn.dataset.status;
        renderStatusFilters();
        render();
        saveState();
      }
    });

    // Context switcher
    renderContextSwitcher();
    dom.contextButtons.addEventListener("click", (e) => {
      const btn = e.target.closest(".context-btn");
      if (btn) {
        state.viewMode = btn.dataset.view;
        renderContextSwitcher();
        render();
        saveState();
      }
    });

    // View toggle button (mobile-friendly)
    dom.viewToggle.addEventListener("click", () => {
      state.viewMode = state.viewMode === "kanban" ? "grid" : "kanban";
      renderContextSwitcher();
      render();
      saveState();
    });

    // Search
    dom.globalSearch.addEventListener("input", () => { render(); });

    // Sort
    dom.sortSelect.value = state.sortBy;
    dom.sortSelect.addEventListener("change", () => {
      state.sortBy = dom.sortSelect.value;
      saveState();
      render();
    });

    // Quick add
    dom.quickAddForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = dom.quickAddInput.value.trim();
      if (!title) return;
      addTask(title, dom.quickAddProject.value, dom.quickAddPriority.value);
      dom.quickAddInput.value = "";
      dom.quickAddInput.focus();
    });

    // Timer
    renderTimer();
    dom.timerStartBtn.addEventListener("click", () => {
      if (state.focus.running) pauseTimer();
      else startTimer();
    });
    dom.timerResetBtn.addEventListener("click", resetTimer);

    // Restore timer if was running
    if (state.focus.running && state.focus.startTime) {
      state.focus.elapsed = Math.floor((Date.now() - state.focus.startTime) / 1000);
      startTimer();
    }

    // Initial render
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
