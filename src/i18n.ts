// Idiomas: português e inglês. O padrão segue o idioma do sistema; dá para trocar em Configurações.
// A interface é escrita em português e traduzida na tela (textos, placeholders, títulos, avisos).

let lang: "pt" | "en" = /^pt/i.test(navigator.language) ? "pt" : "en";
export const getLang = () => lang;
export const isEn = () => lang === "en";
export function setLang(l: string | undefined) {
  lang = l === "pt" || l === "en" ? l : /^pt/i.test(navigator.language) ? "pt" : "en";
  document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
}
export const locale = () => (lang === "pt" ? "pt-BR" : "en-US");

const D: Record<string, string> = {
  "Livros do Estúdio": "Studio books", "Notas": "Notes", "Exportar": "Export", "PDF para impressão (KDP paperback)": "Print PDF (KDP paperback)", "miolo no corte": "interior at trim", "margem interna, nº de página, capítulos em página ímpar": "gutter margin, page numbers, chapters on right-hand pages", "PDF para leitura": "Reading PDF", "A5, para ler ou enviar a alguém": "A5, to read or send to someone", "EPUB (ebook Kindle)": "EPUB (Kindle ebook)", "o formato que a KDP aceita para ebook": "the format KDP accepts for ebooks", "Texto puro": "Plain text", "para colar em qualquer lugar": "to paste anywhere", "Montando o PDF…": "Building the PDF…", "exportado": "exported", "use esse número na capa completa (lombada)": "use this number in the full wrap cover (spine)", "Editar texto": "Edit text", "Mais": "More", "Checar estilo e “soa humano”": "Check style and “sounds human”", "sem IA, custo zero": "no AI, zero cost", "Rascunho guiado sem IA": "Guided draft without AI", "estrutura com trechos do acervo": "structure using library passages", "Mover para cima": "Move up", "Editando o texto — só salva ao clicar em Salvar (⌘S)": "Editing the text — saved only when you click Save (⌘S)", "Este capítulo ainda não foi escrito. Clique em “Escrever com IA” ou em “Editar texto” para escrever à mão.": "This chapter hasn't been written yet. Click “Write with AI”, or “Edit text” to write it by hand.", "ainda não escrito": "not written yet",
  "Ler tudo o que já foi produzido": "Read everything produced so far", "pág.": "pp.",
  "clique para ligar": "click to turn on", "clique para desligar": "click to turn off", "estilo": "style",
  "Escrevendo a bio…": "Writing the bio…", "Reescrever bio com IA": "Rewrite bio with AI", "ideal 120–180": "ideal 120–180", "Sem bio ainda.": "No bio yet.", "a IA lê estas notas em todo pedido": "the AI reads these notes in every request", "Sem notas ainda. Importe um Word com a análise de estilo no Acervo ou escreva aqui.": "No notes yet. Import a Word file with the style analysis in the Library or write here.", "Mostrar menos": "Show less", "Mostrar tudo": "Show all", "Nenhum livro no Acervo ainda.": "No books in the Library yet.", "Abrir o Acervo": "Open the Library", "Autor sem nome": "Unnamed author", "Preencha o perfil abaixo": "Fill in the profile below", "livros": "books", "projetos": "projects", "Perfil": "Profile", "Bio para a Amazon": "Amazon bio", "sem bio ainda": "no bio yet", "Notas de estilo": "Style notes", "sem notas ainda": "no notes yet", "Livros publicados": "Published books", "no Acervo": "in the Library", "Bio pronta — revise e clique em Salvar": "Bio ready — review it and click Save",
  "Conteúdo": "Content", "Criar e publicar": "Create & publish",
  "Para que serve o Acervo?": "What is the Library for?", "Comece subindo os livros do autor": "Start by uploading the author's books", "O Acervo é a base de tudo: é daqui que a IA aprende a voz, o ritmo, o tamanho dos capítulos e os temas do autor para escrever livros novos do mesmo jeito.": "The Library is the foundation: this is where the AI learns the author's voice, rhythm, chapter length and themes to write new books the same way.", "PDF ou Word dos livros já publicados. A IA estuda a voz, o ritmo, os diálogos e o tamanho dos capítulos — e mede quantas palavras cabem em cada página.": "PDF or Word files of the published books. The AI studies the voice, rhythm, dialogue and chapter length — and measures how many words fit on each page.", "Imagens das capas (JPG/PNG). Vincule cada uma ao seu livro: elas viram referência de estilo para as capas novas.": "Cover images (JPG/PNG). Link each one to its book: they become the style reference for new covers.", "Notas e bio": "Notes and bio", "Word ou TXT com a biografia, análises de estilo e anotações. Entram como contexto para a IA e para a página de autor.": "Word or TXT files with the bio, style analyses and notes. They become context for the AI and the author page.", "E as Referências?": "What about References?", "Obras de outros autores (domínio público) ficam em Referências, não aqui. Em cada livro do Estúdio você escolhe se usa o autor, as referências ou os dois.": "Works by other authors (public domain) go in References, not here. In each Studio book you choose whether to use the author, the references or both.", "Arraste os arquivos para esta tela ou clique em Adicionar arquivos. Tudo fica só no seu computador.": "Drag files onto this screen or click Add files. Everything stays on your computer only.",
  "Igual aos livros do autor": "Same as the author's books", "Primeira pessoa": "First person", "Terceira pessoa próxima": "Close third person", "Terceira pessoa onisciente": "Omniscient third person", "Vários pontos de vista": "Multiple points of view", "Passado": "Past", "Presente": "Present", "Adulto": "Adult", "Jovem adulto (New Adult)": "New Adult", "Juvenil (YA)": "Young adult (YA)", "Só os livros do autor": "Author's books only", "voz, ritmo e temas do autor": "the author's voice, rhythm and themes", "Autor + obras de referência": "Author + reference works", "voz do autor, referências para atmosfera e estrutura": "author's voice, references for atmosphere and structure", "Só as obras de referência": "Reference works only", "imita o estilo das referências escolhidas": "imitates the style of the chosen references", "Nenhum livro do autor no Acervo ainda.": "No author books in the Library yet.", "Nenhuma obra de referência ainda — adicione em Referências.": "No reference works yet — add them in References.", "Base da escrita": "Writing basis", "Livros do autor usados como referência": "Author's books used as reference", "Obras de referência usadas": "Reference works used", "Tom e clima": "Tone and mood", "Comparável a": "Comparable to", "Narrador": "Narrator", "Tempo verbal": "Tense", "Público": "Audience", "Observações de estilo": "Style notes", "Estilo artístico da capa": "Cover art style", "Capas do acervo como referência": "Library covers as reference", "Sim — mesmo estilo das capas do autor": "Yes — same style as the author's covers", "Não — estilo livre": "No — free style", "Livros do autor": "Author's books", "nenhum": "none", "nenhuma": "none", "como as capas do autor": "like the author's covers", "estilo livre": "free style", "Nenhum livro do autor selecionado — a IA não terá a voz do autor como base.": "No author book selected — the AI won't have the author's voice as a basis.", "Nenhuma obra de referência selecionada.": "No reference work selected.", "Estilo e referências": "Style and references",
  "Clique num capítulo para ver do que se trata e o texto. Use o Editor para escrever à mão.": "Click a chapter to see what it's about and its text. Use the Editor to write by hand.", "Abrir assistente": "Open assistant", "Reduzir": "Shrink", "Ampliar": "Expand", "Minimizar": "Minimize", "Por capítulo": "Per chapter", "de": "of", "capítulos planejados.": "chapters planned.", "capítulos planejados": "chapters planned", "Ainda sem roteiro.": "No outline yet.", "“Gerar livro completo” cria o que falta e continua de onde parou.": "“Generate full book” creates what is missing and continues where it stopped.", "História": "Story", "páginas": "pages", "capítulos": "chapters", "Abrir no editor": "Open in editor", "Reescrever com IA": "Rewrite with AI", "Continuar com IA": "Continue with AI", "Editar plano": "Edit plan", "Reescrever este capítulo do zero? O texto atual será substituído.": "Rewrite this chapter from scratch? The current text will be replaced.", "Capa da frente pronta. Gere outra, envie uma imagem ou monte a capa completa (verso + lombada + frente) no formato da KDP.": "Front cover ready. Generate another, upload an image, or build the full wrap (back + spine + front) in KDP format.", "Gere a arte da capa com IA de imagem (usa a premissa, os personagens e o estilo das capas do acervo) ou envie uma imagem sua.": "Generate the cover art with an image AI (it uses the premise, the characters and the style of your library covers) or upload your own image.", "Nova capa com": "New cover with", "Gerar capa com": "Generate cover with", "Enviar imagem": "Upload image", "Capa completa KDP": "Full KDP wrap cover", "Para gerar capas, salve a chave do ChatGPT ou do Gemini em Configurações.": "To generate covers, save a ChatGPT or Gemini key in Settings.", "Abrir Configurações": "Open Settings", "pronta": "ready", "arte da capa completa pronta": "full wrap art ready", "sem capa ainda": "no cover yet",
  "Descartar as alterações não salvas?": "Discard unsaved changes?", "Editando — só salva ao clicar em Salvar (⌘S)": "Editing — saved only when you click Save (⌘S)", "Cancelar": "Cancel", "Salvo": "Saved", "Preencher": "Fill", "campo vazio com IA": "empty field with AI", "campos vazios com IA": "empty fields with AI", "Ficha vazia — clique em Editar ou preencha com IA.": "Empty sheet — click Edit or fill it with AI.", "Clique num personagem para abrir a ficha. As fichas entram no roteiro, nos capítulos e no chat.": "Click a character to open the sheet. Sheets feed the outline, the chapters and the chat.", "campos preenchidos": "fields filled", "Vazio — clique em Editar ou complete com IA.": "Empty — click Edit or complete it with AI.",
  "Clique num personagem para ver e editar a ficha completa. As fichas entram no roteiro, nos capítulos e no chat.": "Click a character to see and edit the full sheet. Sheets feed the outline, the chapters and the chat.", "Sem nome": "Unnamed", "menção": "mention", "Fechar": "Close", "Tipo": "Type", "Objeto": "Object", "Organização": "Organization", "Regra / lore": "Rule / lore", "Evento passado": "Past event", "Criatura": "Creature", "Tecnologia": "Technology", "Descrição": "Description", "Detalhes, regras e segredos": "Details, rules and secrets", "Ligado a (personagens, capítulos)": "Linked to (characters, chapters)", "Onde a história se passa e o que importa nela: lugares, objetos, organizações, regras do sobrenatural, eventos do passado. Os tipos são livres — crie os seus.": "Where the story happens and what matters in it: places, objects, organizations, supernatural rules, past events. Types are free — create your own.", "Elemento": "Element", "Completar mundo com IA": "Complete world with AI", "Criar mundo com IA": "Create world with AI", "Nenhum elemento ainda. Adicione lugares e objetos ou peça para a IA criar o mundo a partir da premissa.": "No elements yet. Add places and objects or ask the AI to build the world from the premise.", "Arquitetura narrativa": "Narrative architecture", "baseada nas pesquisas StoryScope e sepia: o que separa ficção humana de ficção de IA": "based on the StoryScope and sepia research: what separates human fiction from AI fiction", "Tema": "Theme", "Implícito (os fatos mostram)": "Implied (events show it)", "Escondido (o leitor deduz)": "Withheld (reader infers)", "Dito com todas as letras": "Stated outright", "Subtrama": "Subplot", "Uma subtrama paralela ao tema": "One subplot mirroring the theme", "Subtrama em contraste": "Contrasting subplot", "Subtrama independente": "Independent subplot", "Sem subtrama": "No subplot", "Tempo": "Time", "Linear com alguns flashbacks": "Linear with a few flashbacks", "Passado e presente entrelaçados": "Braided past and present", "Totalmente linear": "Strictly linear", "Revelações": "Revelations", "No fim (obriga a reler o começo)": "Back-loaded (recasts the beginning)", "Distribuídas": "Spread out", "Logo no início": "Early on", "Emoções": "Emotions", "Mistura: nomeadas, comportamento, corpo só nos picos": "Mix: named, behaviour, body only at peaks", "Pelo comportamento": "Through behaviour", "Pelo corpo (bem IA)": "Through the body (very AI)", "Apresentação do protagonista": "Protagonist introduction", "Falando, numa conversa": "Mid-conversation", "Em ação": "In action", "Pelo que os outros dizem": "Through what others say", "Descrição física (bem IA)": "Physical description (very AI)", "Moral do protagonista": "Protagonist's morality", "Ambígua, com falhas": "Ambivalent, flawed", "Falha trágica": "Tragic flaw", "Anti-herói": "Antihero", "Herói correto": "Upright hero", "Quem resolve o final": "What drives the ending", "Escolha + acaso/outros": "Choice + chance/others", "Forças externas": "External forces", "Só a escolha do protagonista": "Only the protagonist's choice", "Tipo de final": "Ending type", "Resolvido em parte, com custo": "Partly resolved, at a cost", "Aberto, com gancho": "Open, with a hook", "Catastrófico": "Catastrophic", "Um ato concreto": "A concrete act", "Aceitação interior (bem IA)": "Inner acceptance (very AI)", "Mundo real": "Real world", "Citar lugares, marcas, músicas e obras reais": "Name real places, brands, songs and works", "Poucas referências": "A few references", "Nenhuma": "None", "Narrador e leitor": "Narrator and reader", "Narrador fala com o leitor de vez em quando": "Narrator addresses the reader now and then", "Nunca": "Never", "Soa humano (StoryScope/sepia)": "Sounds human (StoryScope/sepia)", "Nenhum vício típico de IA encontrado.": "No typical AI tells found.", "Ritmo uniforme: varie mais — frases curtíssimas ao lado de longas.": "Uniform rhythm: vary more — very short sentences next to long ones.", "Baixo": "Low", "Alto": "High", "Muito alto": "Very high", "Máximo": "Max", "Esforço": "Effort", "Esforço do Claude": "Claude effort", "Atualizar limites": "Refresh limits", "zera em": "resets in", "Limites ainda não lidos — clique em atualizar": "Limits not read yet — click refresh",
  // capa completa
  "Capa completa (verso, lombada e frente)": "Full cover (back, spine and front)", "Capa completa · paperback KDP": "Full cover · KDP paperback", "Medidas": "Size", "Creme": "Cream", "Branco": "White",
  "Páginas do miolo (define a lombada)": "Interior pages (sets the spine width)", "Arte": "Artwork", "Arte panorâmica (capa inteira)": "Panoramic art (full wrap)", "Arte só da frente": "Front-only art", "Usar imagem minha": "Use my own image",
  "Para gerar a arte, salve a chave do ChatGPT ou do Gemini em Configurações.": "To generate the art, save a ChatGPT or Gemini key in Settings.", "Remover arte panorâmica (usar a da frente)": "Remove panoramic art (use the front art)",
  "Textos": "Texts", "Escrever com IA": "Write with AI", "Selo / série (topo da frente)": "Label / series (top of front)", "Chamada do verso": "Back tagline",
  "Texto do verso (sinopse)": "Back cover text (blurb)", "Mini bio (opcional)": "Short bio (optional)", "Fonte do título": "Title font", "Impacto (thriller)": "Impact (thriller)", "Gravada (clássica)": "Engraved (classic)",
  "Elegante (Didot)": "Elegant (Didot)", "Serifada": "Serif", "Moderna": "Modern", "Título na frente": "Title on the front", "Embaixo": "Bottom", "Em cima": "Top", "Destaque": "Accent", "Lombada": "Spine",
  "Tamanho do título": "Title size", "Escurecer o verso": "Darken the back", "Mostrar guias (corte, lombada, área segura)": "Show guides (trim, spine, safe area)", "Exportar PDF para a KDP": "Export PDF for KDP",
  "Frente para o ebook (1600×2560)": "Front for the ebook (1600×2560)", "Vermelho: linha de corte · azul: lombada · verde: área segura (textos importantes dentro dela). A caixa branca é onde a KDP imprime o código de barras.": "Red: trim line · blue: spine · green: safe area (keep important text inside). The white box is where KDP prints the barcode.",
  "Gerando… (até 1 min)": "Generating… (up to 1 min)", "Escrevendo…": "Writing…", "Textos da capa prontos": "Cover texts ready", "Gerando a capa em 300 dpi…": "Rendering the cover at 300 dpi…", "PDF da capa pronto para a KDP": "Cover PDF ready for KDP",
  "Frente salva como capa do ebook (usada no EPUB)": "Front saved as the ebook cover (used in the EPUB)", "Salve a chave do ChatGPT ou do Gemini em Configurações": "Save a ChatGPT or Gemini key in Settings",
  "Escolha uma IA de texto (Claude, Local…) no Estúdio": "Choose a text AI (Claude, Local…) in the Studio",
  "Essa imagem é a arte da capa inteira (panorâmica)? OK = capa inteira · Cancelar = só a frente": "Is this image the full-wrap (panoramic) art? OK = full wrap · Cancel = front only",
  // estúdio reorganizado
  "Tipo de personalidade (MBTI)": "Personality type (MBTI)", "Escolha um tipo ou deixe a IA definir": "Pick a type or let the AI decide", "Completar elenco com IA": "Complete the cast with AI", "Criar elenco com IA": "Create the cast with AI", "Completar com IA": "Complete with AI",
  "Do que se trata": "What it's about", "O que acontece neste capítulo": "What happens in this chapter", "Ainda não escrito.": "Not written yet.", "Abrir e editar": "Open and edit", "Reescrever": "Rewrite", "Escrever": "Write", "Visão geral": "Overview", "Editor": "Editor",
  "Gerar livro completo": "Generate full book", "Continuar escrevendo": "Continue writing", "Livro escrito": "Book written",   "Premissa e ideias": "Premise and ideas", "Tamanho em páginas": "Length in pages", "O roteiro atual é só o modelo sem IA.": "The current outline is only the no-AI template.",
  "“Gerar livro completo” refaz o roteiro com a IA (o texto já escrito fica).": "“Generate full book” redoes the outline with AI (text already written is kept).",
  "Refazer fichas + roteiro com IA": "Redo character sheets + outline with AI", "Roteiro modelo (sem IA)": "Template outline (no AI)", "Roteiro modelo": "Template outline",
  "Ideia e tamanho": "Idea and length", "Plano do capítulo": "Chapter plan", "Reescrever capítulo": "Rewrite chapter",   "Sem capítulos ainda. Clique em “Gerar livro completo”.": "No chapters yet. Click “Generate full book”.", "Publicar na KDP": "Publish on KDP",
  "Negrito": "Bold", "Itálico": "Italic", "Assistente": "Assistant", "Detalhes dos motores": "Engine details",
  "Modo Básico (sem IA): usa o perfil de estilo e o texto do acervo. Não escreve capítulos.": "Basic mode (no AI): uses the style profile and library text. Does not write chapters.",
  "Rascunho guiado do capítulo": "Guided chapter draft",   "Para escrever o livro, troque acima para": "To write the book, switch above to", "(grátis) ou": "(free) or", "configurar": "set up",
  "Converse sobre o livro: peça ideias, reviravoltas, um capítulo mais tenso… A IA conhece o estilo do autor, as fichas e o roteiro.": "Talk about the book: ask for ideas, twists, a tenser chapter… The AI knows the author's style, the character sheets and the outline.",
  "Peça algo: ‘deixe o capítulo 3 mais tenso’, ‘sugira um plot twist’…": "Ask something: ‘make chapter 3 tenser’, ‘suggest a plot twist’…",   "O motor": "The", "não escreve o texto. Escolha Local ou Claude no chat ao lado.": "engine does not write prose. Choose Local or Claude in the chat on the right.",
  "Escolha Local ou Claude para escrever o livro": "Choose Local or Claude to write the book",
  // limites, tempo e capa
  "Não escreve o texto do livro — só roteiro, rascunho guiado e checagem de estilo. Instantâneo.": "Does not write the book's text — only outline, guided draft and style check. Instant.",
  "Baixe um modelo para ver o limite e o tempo.": "Download a model to see the limit and time.", "Limite: 0 páginas de texto (não escreve prosa)": "Limit: 0 pages of text (writes no prose)",
  "Tempo: instantâneo": "Time: instant", "Capa (opcional — gerada junto com o livro)": "Cover (optional — generated with the book)", "Sem capa agora": "No cover now",
  "dá para gerar depois na KDP": "you can generate it later in KDP", "chave salva": "key saved", "precisa de chave": "needs a key", "Modelo:": "Model:", "Padrão": "Default",
  "Opus (melhor escrita)": "Opus (best writing)", "Sonnet (mais rápido)": "Sonnet (faster)", "Salve a chave dessa IA em Configurações primeiro": "Save this AI's key in Settings first",
  "Escrevendo a ideia da capa…": "Writing the cover idea…",
  // tamanho e geração do livro
  "Tamanho do livro": "Book length", "Curto": "Short", "Médio": "Medium", "Completo": "Full", "Longo": "Long", "Capítulos": "Chapters", "Parar": "Stop",
  "Fichas + roteiro com IA": "Character sheets + outline with AI", "Criando as fichas dos personagens…": "Creating the character sheets…", "Parando…": "Stopping…",
  "Geração parada — continue quando quiser com Escrever todos": "Generation stopped — continue anytime with Write all",
  "Para escrever capítulos completos escolha Local ou Claude (o Básico não escreve texto)": "To write full chapters choose Local or Claude (Basic does not write prose)",
  "Roteiro criado sem IA. Para fichas de personagens e capítulos completos, escolha Local ou Claude": "Outline created without AI. For character sheets and full chapters, choose Local or Claude",
  "Refazer o roteiro? Os textos já escritos ficam nos capítulos de mesma posição.": "Redo the outline? Text already written stays in the chapters at the same position.",
  // estúdio: histórico e personagens
  "Seus livros criados": "Your created books", "Editar": "Edit", "Personagens": "Characters", "Ler o livro": "Read the book", "Personagem": "Character",
  "Criar fichas com IA": "Create sheets with AI", "Nome": "Name", "Papel": "Role", "Idade": "Age", "Personalidade": "Personality", "Aparência": "Appearance", "Arco / segredo": "Arc / secret", "Relações": "Relationships",
  "A ficha de cada personagem entra em tudo que for escrito: esboço, capítulos e chat. Escreva em inglês, o idioma do livro.": "Each character sheet feeds everything that gets written: outline, chapters and chat. Write in English, the book's language.",
  "Nenhum personagem ainda. Adicione ou peça para a IA criar a partir da premissa.": "No characters yet. Add one or ask the AI to create them from the premise.",
  "Editar no Estúdio": "Edit in Studio", "Fichas criadas — ajuste o que quiser": "Sheets created — adjust anything you like", "A resposta não veio no formato esperado": "The answer did not come in the expected format",
  // navegação e geral
  "Acervo": "Library", "Leitor": "Reader", "Autor": "Author", "Estilo": "Style", "Estúdio": "Studio", "Referências": "References",
  "Publicar KDP": "Publish on KDP", "Configurações": "Settings", "Motor de escrita": "Writing engine", "Quem escreve": "Who writes",
  "Lugares": "Places", "Objetos": "Objects", "Eventos": "Events", "Mapa e análise": "Map & analysis", "Lombada (texto)": "Spine (text)", "Bio": "Bio", "Código de barras (KDP)": "Barcode (KDP)", "Guias (esconder antes de exportar)": "Guides (hide before exporting)", "Livro": "Book", "Livros": "Books", "Capa": "Cover", "Capas": "Covers", "Notas / Bio": "Notes / Bio", "Notas / Bios": "Notes / Bios", "Outro": "Other", "Outros": "Others",
  "Salvar": "Save", "Copiar": "Copy", "Copiado": "Copied", "Remover": "Remove", "Ler": "Read", "Usar": "Use", "Enviar": "Send", "Subir": "Move up", "Pausar": "Pause",
  "Carregando…": "Loading…", "Texto": "Text", "Páginas": "Pages", "Claro": "Light", "Sépia": "Sepia", "Noite": "Night", "Escolher obra…": "Choose a work…",
  "Sem título": "Untitled", "Recomendado": "Recommended", "Erro:": "Error:", "Imagem": "Image", "Obras": "Works", "Obra": "Work", "Palavras": "Words",
  // acervo
  "Seus livros, capas e anotações. Arraste arquivos PDF, Word (.docx), TXT ou imagens para cá.": "Your books, covers and notes. Drag PDF, Word (.docx), TXT or image files here.",
  "Adicionar arquivos": "Add files", "Comece subindo seus livros": "Start by uploading your books", "Escolher arquivos": "Choose files",
  "PDF do miolo, Word com bio/anotações e as capas. O app lê tudo, aprende o estilo e organiza para a Amazon.": "The interior PDF, a Word file with bio/notes, and the covers. The app reads everything, learns the style and organizes it for Amazon.",
  "Capas sem livro": "Covers without a book", "vincule cada capa a um livro": "link each cover to a book", "Vincular ao livro…": "Link to book…",
  "Ver / exportar capa": "View / export cover", "Adicionar capa": "Add cover", "Mostrar arquivo": "Show file", "Livros e imagens": "Books and images",
  "Capa (PDF ou imagem)": "Cover (PDF or image)", "Trocar capa": "Replace cover", "Miniatura no acervo": "Library thumbnail", "Frente": "Front", "Capa inteira": "Full cover",
  "Posição (arraste para centralizar a frente)": "Position (drag to center the front)", "Detectado: capa completa (verso, lombada e frente).": "Detected: full wrap cover (back, spine and front).",
  "Detectado: só a frente.": "Detected: front cover only.", "Carregando em alta resolução…": "Loading in high resolution…", "Exportar PNG (alta resolução)": "Export PNG (high resolution)",
  "Capa exportada": "Cover exported", "Gerando PNG em alta resolução…": "Generating high-resolution PNG…", "Análise do estilo do autor": "Author style analysis",
  // leitor
  "Escolha uma obra do acervo ou um projeto do estúdio.": "Choose a work from the library or a studio project.", "Texto exportado": "Text exported", "EPUB exportado": "EPUB exported",
  "Ver capa": "View cover", "(projeto)": "(project)",
  // autor
  "Quem escreve. Esses dados alimentam a IA, a página do livro e a bio da Amazon (Author Central).": "Who writes. This feeds the AI, the book page and the Amazon bio (Author Central).",
  "Preencher pelo acervo": "Fill from library", "Escrever bio com IA": "Write bio with AI", "Nome do autor": "Author name", "Nome artístico (capa)": "Pen name (cover)",
  "E-mail": "Email", "Site / redes": "Website / social", "Gêneros": "Genres", "País / cidade": "Country / city", "Bio (curta, para a Amazon)": "Bio (short, for Amazon)",
  "Notas editoriais sobre o estilo (vindas do Word ou escritas por você)": "Editorial notes on the style (from the Word file or written by you)",
  "Horror psicológico, suspense": "Psychological horror, suspense", "Dados preenchidos a partir do acervo": "Details filled in from the library",
  // estilo
  "Estilo do autor": "Author style", "Medido direto nos livros do acervo — funciona sem IA e é a base para tudo que for gerado.": "Measured straight from the library books — works without AI and is the basis for everything generated.",
  "↻ Analisar acervo": "↻ Analyze library", "Analisar acervo": "Analyze library", "Adicione livros ao acervo e clique em Analisar.": "Add books to the library and click Analyze.",
  "palavras analisadas": "words analyzed", "palavras por frase": "words per sentence", "parágrafos com diálogo": "paragraphs with dialogue", "palavras por capítulo": "words per chapter",
  "riqueza de vocabulário": "vocabulary richness", "ponto de vista": "point of view", "1ª pessoa": "1st person", "3ª pessoa": "3rd person",
  "Retrato do estilo": "Style portrait", "Temas (ocorrências / 10 mil palavras)": "Themes (hits / 10k words)", "Palavras-assinatura": "Signature words",
  "Expressões que se repetem": "Recurring phrases", "Personagens recorrentes": "Recurring characters", "Verbos de fala": "Dialogue tags", "Pontuação / mil palavras": "Punctuation / 1,000 words",
  "Por livro": "By book", "Palavras/frase": "Words/sentence", "Diálogo": "Dialogue", "Aberturas de capítulo do autor": "The author's chapter openings",
  "Checar um texto contra o estilo": "Check a text against the style", "Cole um trecho novo aqui…": "Paste a new passage here…", "Comparar": "Compare",
  "Bíblia do autor · personagens": "Author bible · characters", "Aprofundar com IA": "Deepen with AI", "Técnicas narrativas": "Narrative techniques", "Estrutura dos livros": "Book structure", "Ver tudo": "Show all",
  "menções": "mentions", "Ligações:": "Links:", "gancho": "hook", "Estilo analisado": "Style analyzed", "Bíblia aprofundada": "Bible deepened",
  "medo/terror": "fear/terror", "morte/violência": "death/violence", "amor/romance": "love/romance", "obsessão/ciúme": "obsession/jealousy", "sobrenatural": "supernatural",
  "amizade/família": "friendship/family", "traição/segredo": "betrayal/secrets", "luto/tristeza": "grief/sadness", "Cole pelo menos 30 palavras": "Paste at least 30 words",
  "Analisando o estilo do autor…": "Analyzing the author's style…", "Compilando a bíblia do autor (personagens, estrutura, técnicas)…": "Compiling the author bible (characters, structure, techniques)…",
  "Adicione pelo menos um livro ao acervo": "Add at least one book to the library",
  // estúdio
  "Novo livro": "New book", "Vamos criar um livro novo": "Let's create a new book", "Preencha o que souber — o resto a IA sugere.": "Fill in what you know — the AI suggests the rest.",
  "No estilo de": "In the style of", "Nome do livro": "Book title", "Ex.: Silent Vows": "E.g. Silent Vows", "Suas ideias": "Your ideas",
  "Do que é a história? Quem são os personagens? Onde se passa? Que reviravolta você imagina? Pode escrever do jeito que vier.": "What is the story about? Who are the characters? Where is it set? What twist do you imagine? Write it any way you like.",
  "Personagens principais (opcional)": "Main characters (optional)", "Ex.: Riya, Kabir, Meera": "E.g. Riya, Kabir, Meera", "Base de conhecimento": "Knowledge base",
  "Meus livros": "My books", "estilo, ritmo e personagens": "style, rhythm and characters", "Obras de referência": "Reference works", "Tamanho": "Length",
  "Conto": "Short story", "Novela": "Novella", "Romance": "Novel", "5 capítulos": "5 chapters", "12 capítulos": "12 chapters", "25 capítulos": "25 chapters",
  "Criar meu livro": "Create my book", "já escrever todos os capítulos": "write all chapters right away", "Dê um nome ou escreva suas ideias": "Give it a title or write your ideas",
  "nenhuma ainda — adicione em Referências": "none yet — add them in References",
  "Ideia": "Idea", "Roteiro": "Outline", "Escrita": "Writing", "Publicação": "Publishing", "Premissa e personagens": "Premise and characters", "Gere o roteiro": "Generate the outline",
  "Capa, descrição e EPUB": "Cover, description and EPUB", "Título do livro": "Book title", "Subtítulo (opcional)": "Subtitle (optional)",
  "Premissa: do que é a história? Quem é o protagonista, o que ele quer, o que dá errado?": "Premise: what is the story about? Who is the protagonist, what do they want, what goes wrong?",
  "Personagens (separados por vírgula)": "Characters (comma separated)", "Gênero": "Genre", "Nº de capítulos": "No. of chapters", "Esboço sem IA": "Outline without AI",
  "Esboço com IA": "Outline with AI", "Escrever todos": "Write all", "Publicar": "Publish", "Apagar projeto": "Delete project", "Quebra de cena": "Scene break",
  "Rascunho sem IA": "Draft without AI", "Checar estilo": "Check style", "Escrever capítulo": "Write chapter", "Apagar capítulo": "Delete chapter",
  "Sem capítulos. Gere um esboço ou adicione um capítulo.": "No chapters yet. Generate an outline or add a chapter.", "Capítulo": "Chapter", "palavras": "words",
  "Assistente sem IA": "Assistant without AI", "Modo gratuito: usa o perfil de estilo e o texto do acervo.": "Free mode: uses the style profile and the library text.",
  "Gerar esboço do livro": "Generate book outline", "Rascunho do capítulo": "Chapter draft", "Checar estilo do capítulo": "Check chapter style", "Descrição e keywords KDP": "KDP description and keywords",
  "Para escrever capítulos completos no estilo do autor, escolha": "To write full chapters in the author's style, choose", "(grátis, offline) ou Claude.": "(free, offline) or Claude.",
  "Escolher motor de escrita": "Choose writing engine", "Chat": "Chat", "Inserir no capítulo": "Insert into chapter", "Usar como capítulos": "Use as chapters",
  "Peça algo: ‘escreva o capítulo 3 com mais tensão’, ‘sugira um plot twist’…": "Ask something: ‘write chapter 3 with more tension’, ‘suggest a plot twist’…",
  "■ Parar": "■ Stop", "Limpar conversa": "Clear chat", "5 ideias de livro": "5 book ideas", "Sinopse": "Synopsis", "Esboço de capítulos": "Chapter outline",
  "Escrever capítulo atual": "Write current chapter", "Continuar o texto": "Continue the text", "Revisar no meu estilo": "Revise in my style", "Descrição + keywords KDP": "KDP description + keywords",
  "Prompt de capa": "Cover prompt", "Inserido no capítulo": "Inserted into chapter", "Escolha um capítulo": "Choose a chapter", "Crie/escolha um capítulo primeiro": "Create/choose a chapter first",
  "Esboço criado — edite os títulos e planos à vontade": "Outline created — edit titles and plans freely", "Substituir os capítulos atuais pelo novo esboço?": "Replace the current chapters with the new outline?",
  "Apagar este capítulo?": "Delete this chapter?", "Limpar a conversa?": "Clear the conversation?", "Todos os capítulos já têm texto": "All chapters already have text",
  "Capítulos escritos — revise e ajuste o que quiser": "Chapters written — review and adjust as you like", "Escreva pelo menos 30 palavras no capítulo": "Write at least 30 words in the chapter",
  "Escolha e prepare um motor de escrita com IA": "Choose and set up an AI writing engine", "Não achei capítulos nessa resposta (esperado ‘## Chapter N: …’)": "No chapters found in that reply (expected ‘## Chapter N: …’)",
  "Mundo normal": "Ordinary world", "Laços": "Bonds", "A rachadura": "The crack", "Ciúme e desejo": "Jealousy and desire", "Ponto sem volta": "Point of no return", "Primeira perda": "First loss",
  "Investigação": "Investigation", "Traição": "Betrayal", "Descida": "Descent", "Confronto": "Confrontation", "Eco final": "Final echo",
  // referências
  "Obras de referência ": "Reference works", "Adicionar obras (.txt, .pdf, .docx)": "Add works (.txt, .pdf, .docx)", "continua sendo o do autor.": "is still the author's.",
  "Livros de domínio público ou com licença liberada (ex.: Project Gutenberg) para ampliar a base de conhecimento — estrutura, atmosfera, vocabulário. O": "Public-domain or openly licensed books (e.g. Project Gutenberg) to broaden the knowledge base — structure, atmosphere, vocabulary. The",
  "Usando as referências ao escrever": "Using references when writing", "Referências desligadas ao escrever": "References off when writing", "clique para": "click to", "desligar": "turn off", "ligar": "turn on",
  "Nenhuma obra ainda. Use só textos de domínio público ou que você tem direito de usar.": "No works yet. Only use public-domain texts or texts you have the right to use.",
  // kdp
  "Publicar na Amazon KDP": "Publish on Amazon KDP", "Tudo o que o formulário da KDP pede, num lugar só. Exporte o EPUB e suba em kdp.amazon.com.": "Everything the KDP form asks for, in one place. Export the EPUB and upload it at kdp.amazon.com.",
  "Exportar EPUB": "Export EPUB", "Sem capa": "No cover", "Escolher imagem de capa": "Choose cover image", "Gerar arte de capa com IA": "Generate cover art with AI",
  "Capas do acervo (usadas como referência na geração):": "Library covers (used as reference when generating):", "Checklist": "Checklist", "Título": "Title", "Subtítulo": "Subtitle", "Série": "Series",
  "Idioma": "Language", "Inglês": "English", "Português": "Portuguese", "Espanhol": "Spanish", "Preço (US$) — 2.99 a 9.99 dá 70% de royalties": "Price (US$) — 2.99 to 9.99 earns 70% royalties",
  "Autor (capa)": "Author (cover)", "7 palavras-chave": "7 keywords", "Categorias (uma por linha)": "Categories (one per line)", "Preencher sem IA": "Fill without AI",
  "Preencher com IA": "Fill with AI", "Copiar tudo": "Copy all", "Crie um livro no Estúdio primeiro.": "Create a book in the Studio first.", "Nome do autor ": "Author name",
  "Descrição (150+ caracteres)": "Description (150+ characters)", "7 palavras-chave ": "7 keywords", "2+ categorias": "2+ categories", "Capa (JPG/PNG, ideal 1600×2560)": "Cover (JPG/PNG, ideally 1600×2560)", "Preço": "Price",
  "Metadados copiados": "Metadata copied", "Sugestões preenchidas — revise antes de publicar": "Suggestions filled in — review before publishing", "EPUB exportado — pronto para subir na KDP": "EPUB exported — ready to upload to KDP",
  "O livro não tem capítulos": "The book has no chapters", "Capa gerada": "Cover generated", "Gerando capa com IA…": "Generating cover with AI…",
  "Descreva a arte da capa (em inglês funciona melhor). Sem texto na imagem — título e autor entram depois.": "Describe the cover art. No text in the image — title and author are added later.",
  // motores
  "Quem vai escrever com você?": "Who will write with you?", "Troque quando quiser — seus livros e o estilo do autor continuam os mesmos.": "Switch any time — your books and the author's style stay the same.",
  "Básico": "Basic", "Local": "Local", "Instantâneo, sem IA": "Instant, no AI", "IA no seu computador, sem internet": "AI on your computer, no internet", "GRÁTIS": "FREE",
  "Análise do estilo e bíblia do autor": "Style analysis and author bible", "Esboço por estrutura narrativa": "Outline from narrative structure", "Rascunho guiado e checagem de estilo": "Guided draft and style check",
  "Escreve capítulos inteiros no estilo do autor": "Writes full chapters in the author's style", "Privado: nada sai do seu computador": "Private: nothing leaves your computer",
  "Baixa o modelo uma vez e usa para sempre": "Download the model once, use it forever", "A melhor escrita · sua assinatura": "The best writing · your subscription",
  "Texto e capas · chave de API": "Text and covers · API key", "Gera capas": "Makes covers", "Não gera capas": "No covers", "Com conta ou chave de API": "With an account or API key",
  "Capas com IA só pelo ChatGPT ou Gemini (com sua chave): gerar uma capa boa de verdade no próprio computador exigiria baixar vários GB e o resultado não fica no nível de uma capa profissional.": "AI covers only via ChatGPT or Gemini (with your key): making a truly good cover on your own computer would need several GB of downloads and still wouldn't reach professional cover quality.",
  "Sempre pronto": "Always ready", "Escolha o modelo": "Choose the model", "Baixar um modelo": "Download a model", "Instale o Claude Code": "Install Claude Code", "Pronto · Claude Code": "Ready · Claude Code",
  "Pronto · chave salva": "Ready · key saved", "Adicionar chave": "Add key", "Modelos do modo Local": "Local mode models", "Em uso": "In use", "Usar este": "Use this",
  "Usar um arquivo .gguf que já tenho": "Use a .gguf file I already have", "Apagar do computador": "Delete from computer", "Modelo pronto para usar!": "Model ready to use!",
  "Rápido": "Fast", "Equilibrado": "Balanced", "Escritor": "Writer", "Modelo importado": "Imported model", "Copiando o modelo…": "Copying the model…",
  "Qwen 2.5 · 3B — leve, roda em qualquer máquina": "Qwen 2.5 · 3B — light, runs on any machine", "Qwen 2.5 · 7B — boa escrita, recomendado": "Qwen 2.5 · 7B — good writing, recommended",
  "Mistral Nemo · 12B — a melhor prosa de ficção": "Mistral Nemo · 12B — the best fiction prose", "Modelo e testes em Configurações.": "Model and tests in Settings.",
  "Carregando o modelo…": "Loading the model…", "Lendo o contexto…": "Reading the context…",
  // configurações
  "Escolha como o app escreve. O modo sem IA é sempre gratuito.": "Choose how the app writes. The no-AI mode is always free.", "Claude (versão completa)": "Claude (full version)",
  "Usa o": "Uses", "instalado neste computador, com a sua assinatura do Claude — sem chave de API.": "installed on this computer, with your Claude subscription — no API key.",
  "Modelo (vazio = padrão)": "Model (empty = default)", "Salvar chave": "Save key", "Testar / listar modelos": "Test / list models", "Modelo de texto": "Text model",
  "Imagens (capas e ilustrações)": "Images (covers and illustrations)", "Backup": "Backup", "Exportar backup": "Export backup", "Importar backup": "Import backup",
  "Tudo num único .zip: acervo, textos, capas, projetos, autor, estilo e configurações (os modelos de IA local ficam de fora — baixe de novo se precisar).": "Everything in one .zip: library, texts, covers, projects, author, style and settings (local AI models are left out — download them again if needed).",
  "Dados": "Data", "Tudo fica neste computador. As chaves ficam no arquivo secrets.json da pasta de dados.": "Everything stays on this computer. Keys are kept in secrets.json in the data folder.",
  "Abrir pasta de dados": "Open data folder", "Idioma do app": "App language", "Automático (sistema)": "Automatic (system)", "Gerando backup…": "Creating backup…", "Restaurando backup…": "Restoring backup…",
  "Incluir as chaves de API no backup? (OK = sim, Cancelar = não)": "Include API keys in the backup? (OK = yes, Cancel = no)",
  "Restaurar este backup? Arquivos com o mesmo nome serão substituídos.": "Restore this backup? Files with the same name will be replaced.",
  "Apagar este modelo do computador? Dá para baixar de novo depois.": "Delete this model from the computer? You can download it again later.",
  "Chave salva": "Key saved", "Chave removida": "Key removed",
};

const RULES: [RegExp, any][] = [
  [/^Muitas emoções pelo corpo \(([\d.]+)\/mil palavras\): troque algumas por ação ou pelo nome da emoção\.$/, "Too many bodily emotions ($1/1000 words): swap some for action or the emotion's name."],
  [/^Cheiros demais \(([\d.]+)\/mil\): a IA exagera no olfato; mantenha só um ou dois\.$/, "Too many smells ($1/1000): AI overuses smell; keep one or two."],
  [/^(\d+) frase\(s\) explicando a lição ou o tema: corte ou troque por um fato concreto\.$/, "$1 sentence(s) explaining the lesson or theme: cut or replace with a concrete fact."],
  [/^(\d+) expressão\(ões\) típicas de IA (.*)$/, "$1 typical AI expression(s) $2"],
  [/^Pouco diálogo \((\d+)% dos parágrafos\): humanos usam mais conversa\.$/, "Little dialogue ($1% of paragraphs): humans use more conversation."],
  [/^Mundo \((\d+)\)$/, "World ($1)"],
  [/^Capa total ([\d.]+)" × ([\d.]+)" \((\d+) × (\d+) px a 300 dpi\) · lombada ([\d.]+)"( · menos de 79 páginas: a KDP não permite texto na lombada)?$/, (m: string, a: string, b: string, c: string, d: string, e: string, f?: string) => `Full cover ${a}" × ${b}" (${c} × ${d} px at 300 dpi) · spine ${e}"${f ? " · under 79 pages: KDP does not allow spine text" : ""}`],
  [/^Imagem com (.+) \(troque em Configurações\)\. As capas do acervo entram como referência de estilo\.$/, "Image by $1 (change it in Settings). The library covers are used as style references."],
  [/^(\d+) de (\d+) capítulos · ([\d.,]+) de ~([\d.,]+) palavras · ~(\d+) de (\d+) páginas$/, "$1 of $2 chapters · $3 of ~$4 words · ~$5 of $6 pages"],
  [/^Personagens \((\d+)\)$/, "Characters ($1)"], [/^Capítulos \((\d+)\)$/, "Chapters ($1)"],
  [/^O roteiro atual tem (\d+) capítulos, mas para (\d+) páginas são (\d+)\.$/, "The current outline has $1 chapters, but $2 pages need $3."],
  [/^(.+) — configurar$/, "$1 — set up"],
  [/^Limite: (.+)$/, (m: string, a: string) => "Limit: " + a.replace(/Rápido/g, "Fast").replace(/Equilibrado/g, "Balanced").replace(/Escritor/g, "Writer").replace(/pág/g, "pages")],
  [/^Tempo para 150 páginas: (.+)$/, "Time for 150 pages: $1"],
  [/^(\d+)% dos capítulos abrem com diálogo; (\d+)% abrem com um pensamento do personagem\.$/, "$1% of chapters open with dialogue; $2% open with a character's thought."],
  [/^(\d+)% dos capítulos terminam com gancho \(pergunta, exclamação ou frase curta de impacto\)\.$/, "$1% of chapters end on a hook (a question, an exclamation or a short punchy line)."],
  [/^Pensamentos diretos dos personagens \((.+)\): (\d+) vezes — revelam o que eles nunca diriam em voz alta\.$/, "Direct character thoughts ($1): $2 times — they reveal what the characters would never say out loud."],
  [/^Quebras de cena \(\*\*\*\) dentro dos capítulos: (\d+)\. Capítulos alternam o foco entre personagens \(POV variado\)\.$/, "Scene breaks (***) inside chapters: $1. Chapters switch focus between characters (varied POV)."],
  [/^Muitos personagens com relações entrelaçadas \(amizade, romance, ciúme\) construídas antes do perigo; ninguém está a salvo\.$/, "Many characters with intertwined relationships (friendship, romance, jealousy) built before the danger; no one is safe."],
  [/^Estrutura dos livros \((\d+) capítulos\)$/, "Book structure ($1 chapters)"],
  [/^(.+?) — (.+)$/, (m: string, a: string, b: string) => { const t = tr(b); return t === b ? m : `${a} — ${t}`; }],
  [/^Até ~(\d+) páginas · 150 páginas em (.+?) \((medido|estimado)\)$/, (m: string, a: string, b: string, c: string) => `Up to ~${a} pages · 150 pages in ${b} (${c === "medido" ? "measured" : "estimated"})`],
  [/^(.+): recomendado até ~(\d+) páginas · (\d+) páginas em (.+?) neste computador( · acima do recomendado, a história pode perder coerência)?$/, (m: string, a: string, b: string, c: string, d: string, e?: string) => `${a}: recommended up to ~${b} pages · ${c} pages in ${d} on this computer${e ? " · above the recommendation, the story may lose coherence" : ""}`],
  [/^Sem limite prático de páginas · (\d+) páginas em (.+?) · usa a cota da sua (assinatura do Claude|chave de API)$/, (m: string, a: string, b: string, c: string) => `No practical page limit · ${a} pages in ${b} · uses your ${c === "chave de API" ? "API key quota" : "Claude subscription quota"}`],
  [/^Gerando a capa com (.+)…$/, "Generating the cover with $1…"],
  [/^Capa: (.+)$/, "Cover: $1"],
  [/^~(\d+) páginas$/, "~$1 pages"],
  [/^≈ ([\d.,]+) palavras · (\d+) capítulos de ~([\d.,]+) palavras(?: \(padrão dos livros do autor: (\d+) palavras por página\))?$/, (m: string, a: string, b: string, c: string, d?: string) => `≈ ${a} words · ${b} chapters of ~${c} words${d ? ` (the author's books average ${d} words per page)` : ""}`],
  [/^Escrevendo (.+) · ([\d.,]+) de ~([\d.,]+) palavras$/, "Writing $1 · $2 of ~$3 words"],
  [/^Criando o roteiro… capítulos (\d+)–(\d+) de (\d+)$/, "Creating the outline… chapters $1–$2 of $3"],
  [/^Escrevendo (.+)…$/, "Writing $1…"],
  [/^(\d+)\/(\d+) cap · ([\d.,]+) palavras · (.+)$/, "$1/$2 ch · $3 words · $4"],
  [/^(\d+) pág · ([\d.,]+) palavras$/, "$1 pages · $2 words"],
  [/^(\d+) cap · ([\d.,]+) palavras$/, "$1 ch · $2 words"],
  [/^([\d.,]+) palavras$/, "$1 words"], [/^(\d+) capítulos$/, "$1 chapters"], [/^(\d+) de (\d+) escritos$/, "$1 of $2 written"],
  [/^(\d+) arquivos · (\d+) projetos$/, "$1 files · $2 projects"], [/^Importando (.+)…$/, "Importing $1…"], [/^Lendo (.+)… (\d+)%$/, "Reading $1… $2%"],
  [/^“(.+)” adicionado \((.+)\)$/, "“$1” added ($2)"], [/^Escrevendo “(.+)”…$/, "Writing “$1”…"], [/^Aprofundando personagens… (.+)$/, "Deepening characters… $1"],
  [/^Resumindo capítulos… (.+)$/, "Summarizing chapters… $1"], [/^(\d+) capítulos criados$/, "$1 chapters created"], [/^Backup salvo \((\d+) arquivos\)$/, "Backup saved ($1 files)"],
  [/^Backup restaurado \((\d+) arquivos\)$/, "Backup restored ($1 files)"], [/^Chave OK — (\d+) modelos$/, "Key OK — $1 models"], [/^Pronto · (.+)$/, (m: string, a: string) => "Ready · " + (D[a] || a)],
  [/^Remover “(.+)” do acervo\?$/, "Remove “$1” from the library?"], [/^Apagar o projeto “(.+)”\?$/, "Delete the project “$1”?"], [/^(\d+) menções · (.+)$/, "$1 mentions · $2"],
  [/^Ligações: (.*)$/, "Links: $1"], [/^(\d+) pal · foco: (.+)$/, "$1 words · focus: $2"], [/^Capa · (.+)$/, "Cover · $1"],
  [/^Descrição do livro \(até 4000 caracteres · (\d+)\)$/, "Book description (up to 4000 characters · $1)"], [/^Texto \(([\d.,]+) palavras\)$/, "Text ($1 words)"],
  [/^Seu computador tem (\d+) GB de memória\.$/, "Your computer has $1 GB of memory."], [/^precisa de (\d+) GB de RAM$/, "needs $1 GB of RAM"], [/pesado para esta máquina/, "heavy for this machine"],
  [/^Baixar \((.+)\)$/, "Download ($1)"], [/^Continuar download \((\d+)%\)$/, "Resume download ($1%)"], [/^(\d+)% · (.+) de (.+)$/, "$1% · $2 of $3"],
  [/^(\d+) obras liberadas$/, "$1 open works"], [/^Usar as (\d+) capas do acervo como referência de estilo \(cores, tipo de arte, clima\)\?$/, "Use the $1 library covers as a style reference (colors, art style, mood)?"],
  [/^(.+) original · (.+) MB$/, "Original $1 · $2 MB"], [/^Afinidade com o estilo: ([\s\S]+)$/, "Style match: $1"], [/^Download: (.+)$/, "Download: $1"],
  [/^Exportar arquivo original \((.+)\)$/, "Export original file ($1)"], [/^Para escrever capítulos completos no estilo do autor, escolha$/, "To write full chapters in the author's style, choose"],
  [/^Chat · (.+)$/, "Chat · $1"], [/^No estilo de (.+)\. Preencha o que souber — o resto a IA sugere\.$/, "In the style of $1. Fill in what you know — the AI suggests the rest."],
];

/** Traduz um texto (exato ou por regra). */
export function tr(s: string): string {
  if (lang === "pt" || !s) return s;
  const k = s.trim();
  if (D[k]) return s.replace(k, D[k]);
  const bullet = k.match(/^([●•✓·]\s*)(.+)$/);
  if (bullet) { const inner = tr(bullet[2]); if (inner !== bullet[2]) return s.replace(k, bullet[1] + inner.trim()); }
  for (const [re, out] of RULES) if (re.test(k)) return s.replace(k, k.replace(re, out));
  return s;
}

const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE"]);
/** Traduz a tela já desenhada (texto, placeholders, títulos). Conteúdo do usuário fica intacto. */
export function translateDom(root: ParentNode = document.body) {
  if (lang === "pt") return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentElement;
      if (!p || SKIP.has(p.tagName) || p.closest("[contenteditable], .page, .msgs, .nt")) return NodeFilter.FILTER_REJECT;
      return n.nodeValue && /[A-Za-zÀ-ÿ]/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const nodes: Text[] = [];
  while (w.nextNode()) nodes.push(w.currentNode as Text);
  for (const n of nodes) { const t = tr(n.nodeValue!); if (t !== n.nodeValue) n.nodeValue = t; }
  root.querySelectorAll?.("[placeholder],[title]").forEach((el) => {
    for (const a of ["placeholder", "title"]) { const v = el.getAttribute(a); if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); } }
  });
}

// avisos nativos também traduzidos
const oc = window.confirm.bind(window), oa = window.alert.bind(window), op = window.prompt.bind(window);
window.confirm = (m?: string) => oc(tr(m || ""));
window.alert = (m?: any) => oa(tr(String(m ?? "")));
window.prompt = (m?: string, d?: string) => op(tr(m || ""), d);
// toasts e telas novas
new MutationObserver((ms) => { if (lang === "pt") return; for (const m of ms) m.addedNodes.forEach((n) => { if (n.nodeType === 1) translateDom(n as Element); else if (n.nodeType === 3 && n.parentElement) translateDom(n.parentElement); }); })
  .observe(document.documentElement, { childList: true, subtree: true });
