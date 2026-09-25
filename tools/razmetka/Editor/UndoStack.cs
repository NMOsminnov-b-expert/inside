using Razmetka.Model;

namespace Razmetka.Editor;

// Отмена и повтор — снимками проекта (JSON без картинок: картинки в images/
// не меняются, меняются только ссылки на них). Снимок проекта — десятки
// килобайт, 200 шагов помещаются в память без забот; зато любая правка
// откатывается одинаково, без отдельной «обратной операции» на каждый жест.
public sealed class UndoStack
{
    const int Limit = 200;
    readonly LinkedList<(string Json, string What)> _undo = new();
    readonly Stack<(string Json, string What)> _redo = new();
    string? _pending;

    public bool CanUndo => _undo.Count > 0;
    public bool CanRedo => _redo.Count > 0;
    public string? UndoWhat => _undo.Last?.Value.What;
    public string? RedoWhat => _redo.Count > 0 ? _redo.Peek().What : null;

    public void Begin(Project p) => _pending = ProjectStore.Serialize(p);

    // Записать шаг, если проект правда поменялся с Begin.
    public bool Commit(Project p, string what)
    {
        if (_pending == null) return false;
        var before = _pending;
        _pending = null;
        if (before == ProjectStore.Serialize(p)) return false;
        _undo.AddLast((before, what));
        if (_undo.Count > Limit) _undo.RemoveFirst();
        _redo.Clear();
        return true;
    }

    public Project? Undo(Project current)
    {
        if (_undo.Last == null) return null;
        var (json, what) = _undo.Last.Value;
        _undo.RemoveLast();
        _redo.Push((ProjectStore.Serialize(current), what));
        return System.Text.Json.JsonSerializer.Deserialize<Project>(json, ProjectStore.Json);
    }

    public Project? Redo(Project current)
    {
        if (_redo.Count == 0) return null;
        var (json, what) = _redo.Pop();
        _undo.AddLast((ProjectStore.Serialize(current), what));
        return System.Text.Json.JsonSerializer.Deserialize<Project>(json, ProjectStore.Json);
    }

    public void Clear() { _undo.Clear(); _redo.Clear(); _pending = null; }
}
