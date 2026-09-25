using System.Text.Json.Serialization;

namespace Razmetka.Model;

// Формат проекта — razmetka.json в папке проекта, картинки — в images/.
//
// Устройство (решение 25.09.2026, пользователь: «формат, который позволяет не
// перепутать слои»):
//   * у каждого элемента постоянный Id — стрелки и рамки ссылаются на слой по
//     Id, а не по месту в списке, поэтому перестановка и замена слоёв их не
//     путают;
//   * порядок наложения — порядок в Sheet.Layers (первый — самый нижний);
//   * обрезка не трогает картинку: Layer.Crop — видимая часть исходника в его
//     пикселях, сам файл в images/ остаётся целым;
//   * рамка (Frame) хранится в пикселях исходника своего слоя, а не полотна:
//     перенос, масштаб и обрезка слоя рамку не сбивают.

public sealed class Project
{
    public int Version { get; set; } = 1;
    public string Title { get; set; } = "";
    public List<Chapter> Chapters { get; set; } = new();
    // Картинки по имени файла в images/ (имя — хэш содержимого: одинаковая
    // картинка хранится один раз, сколько бы слоёв на неё ни ссылалось).
    public Dictionary<string, AssetInfo> Assets { get; set; } = new();
    public List<HistoryEntry> History { get; set; } = new();
}

public sealed class AssetInfo
{
    public string File { get; set; } = "";
    public int W { get; set; }
    public int H { get; set; }
    // Исходное имя файла — для подсказки, откуда картинка.
    public string Name { get; set; } = "";
}

public sealed class Chapter
{
    public string Id { get; set; } = Ids.New("ch");
    public string Title { get; set; } = "";
    // Как документ назван в таблице связей: «Техпаспорт», «Госакт».
    public string DocName { get; set; } = "";
    public List<Sheet> Sheets { get; set; } = new();
}

// Разворот: страница документа, снимки системы и связи между ними.
public sealed class Sheet
{
    public string Id { get; set; } = Ids.New("sh");
    public string Title { get; set; } = "";
    public string Page { get; set; } = "";
    public List<Layer> Layers { get; set; } = new();
    public List<Frame> Frames { get; set; } = new();
    public List<Link> Links { get; set; } = new();
    public List<Note> Notes { get; set; } = new();
}

public static class LayerKind
{
    public const string Image = "image";
    public const string Table = "table";
}

public sealed class Layer
{
    public string Id { get; set; } = Ids.New("ly");
    public string Kind { get; set; } = LayerKind.Image;
    public string Name { get; set; } = "";
    // Подпись над картинкой на полотне («Литера · 02 Площади и этажность»).
    public string Caption { get; set; } = "";
    public string? Asset { get; set; }
    // Видимая часть исходника, пиксели исходника.
    public Box Crop { get; set; } = new();
    // Место на полотне; высота выводится из пропорций видимой части.
    public double X { get; set; }
    public double Y { get; set; }
    public double W { get; set; }
    public bool Locked { get; set; }
    public bool Hidden { get; set; }
    // Кусок таблицы связей: номера строк [From, To) в порядке номеров связей.
    public int TableFrom { get; set; }
    public int TableTo { get; set; }

    [JsonIgnore] public double Scale => Crop.W > 0 ? W / Crop.W : 1;
    [JsonIgnore] public double H => Crop.H * Scale;
}

public sealed class Frame
{
    public string Id { get; set; } = Ids.New("fr");
    public string LayerId { get; set; } = "";
    // Пиксели исходника слоя.
    public Box Box { get; set; } = new();
}

public static class LinkKind
{
    public const string Transfer = "transfer";
    public const string Auto = "auto";
    public const string NameOnly = "name";
    public const string None = "none";

    public static readonly (string Key, string Label)[] All =
    {
        (Transfer, "Переносится"),
        (Auto, "Заполняется по ЕНИ автоматически"),
        (NameOnly, "Идёт только в имя документа"),
        (None, "Не переносится"),
    };
}

public sealed class Link
{
    public string Id { get; set; } = Ids.New("lk");
    public int N { get; set; }
    public string Src { get; set; } = "";
    public string Tgt { get; set; } = "";
    public string Kind { get; set; } = LinkKind.Transfer;
    public string DocField { get; set; } = "";
    public string SystemField { get; set; } = "";
    // Путь стрелки на полотне; пусто — проложить автоматически.
    public List<Pt> Points { get; set; } = new();
    // Сторона рамки, из которой стрелка выходит (SrcSide) и в которую входит
    // (TgtSide): "" — любая, "left", "right", "top", "bottom".
    public string SrcSide { get; set; } = "";
    public string TgtSide { get; set; } = "";
    // «См. также»: связи других разворотов про то же поле.
    public List<string> SeeAlso { get; set; } = new();
    public string Url { get; set; } = "";
}

public sealed class Note
{
    public string Id { get; set; } = Ids.New("nt");
    public double X { get; set; }
    public double Y { get; set; }
    public string Text { get; set; } = "";
    public string Author { get; set; } = "";
    public DateTime At { get; set; } = DateTime.Now;
}

public sealed class HistoryEntry
{
    public DateTime At { get; set; } = DateTime.Now;
    public string Author { get; set; } = "";
    public string What { get; set; } = "";
}

public struct Box
{
    public double X { get; set; }
    public double Y { get; set; }
    public double W { get; set; }
    public double H { get; set; }

    public Box(double x, double y, double w, double h) { X = x; Y = y; W = w; H = h; }

    [JsonIgnore] public readonly double Right => X + W;
    [JsonIgnore] public readonly double Bottom => Y + H;
    public readonly bool Contains(double x, double y) => x >= X && x <= Right && y >= Y && y <= Bottom;
}

public struct Pt
{
    public double X { get; set; }
    public double Y { get; set; }
    public Pt(double x, double y) { X = x; Y = y; }
}

public static class Ids
{
    public static string New(string prefix) => prefix + Guid.NewGuid().ToString("N")[..10];
}
