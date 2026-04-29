● Voy a leer todos los archivos del proyecto para darte una explicación exacta del código real.                                                                                                                                                                            
  
  Read 6 files (ctrl+o to expand)                                                                                                                                                                                                                                          
                                          
● Acá va el recorrido completo. Voy a seguir el orden exacto en que Python ejecuta el código.                                                                                                                                                                              
                       
  ---                                                                                                                                                                                                                                                                      
  Paso 1 — uvicorn app.api.main:app                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   
  Python busca app/api/main.py y lo ejecuta de arriba hacia abajo.                                                                                                                                                                                                         

  Líneas 1-4 de main.py:
  from dotenv import load_dotenv
  load_dotenv()
  Esto es lo primero que corre, antes de cualquier import de LangChain. Lee el .env y pone todas las variables en os.environ. Si no hicieras esto primero, LANGSMITH_API_KEY no estaría en el ambiente cuando LangChain se inicializa y el tracing no funcionaría.

  ---
  Paso 2 — Carga del grafo al arrancar

  Línea 21 de main.py:
  from app.graph import graph

  Python va a app/graph/__init__.py:
  from app.graph.nomad_graph import graph

  Que ejecuta nomad_graph.py completo. El grafo se construye una sola vez cuando arranca el servidor, no en cada request.

  nomad_graph.py al inicializarse:
  1. Importa todos los nodos (profile_node, destination_node, etc.)
  2. Crea el StateGraph(NomadState) — le dice que el estado tiene la forma de NomadState
  3. Registra cada nodo con builder.add_node("nombre", funcion)
  4. Define las aristas (quién va a quién)
  5. Crea MemorySaver() — un diccionario en memoria indexado por thread_id
  6. Compila el grafo con builder.compile(checkpointer=checkpointer) y lo asigna a graph

  Después de esto, FastAPI termina de arrancar y queda escuchando en el puerto 8000.

  ---
  Paso 3 — El usuario manda el primer mensaje

  El browser hace POST /chat con:
  {"message": "Hola, soy argentino, tengo 24 años..."}

  main.py — función chat(request):

  session_id = request.session_id or str(uuid.uuid4())
  config = {"configurable": {"thread_id": session_id}}

  Si el browser no mandó session_id, se genera uno nuevo (UUID). Este thread_id es la clave que usa MemorySaver para guardar y recuperar el estado de esa conversación.

  prev_state = graph.get_state(config)
  had_report = bool(prev_state.values.get("final_report") if prev_state and prev_state.values else False)

  Antes de invocar, pregunta al MemorySaver: ¿ya existe estado guardado para este thread_id? En el primer mensaje, no hay nada → had_report = False.

  result = graph.invoke(
      {"messages": [HumanMessage(content="Hola, soy argentino...")]},
      config=config,
  )

  Acá empieza LangGraph.

  ---
  Paso 4 — LangGraph toma el control

  graph.invoke() hace internamente:

  1. Carga el estado guardado de MemorySaver para thread_id (vacío en el primer mensaje)
  2. Mergea el input {"messages": [HumanMessage(...)]} al estado — ahora state.messages = [HumanMessage(...)]
  3. Llama a _entry_point(state)

  _entry_point(state):
  def _entry_point(state: NomadState) -> str:
      if state.final_report:
          return "followup"
      return "profile"

  state.final_report es None → retorna "profile". LangGraph activa el nodo "profile".

  ---
  Paso 5 — profile_node (primer mensaje)

  app/nodes/profile_node.py

  def profile_node(state: NomadState) -> dict:
      if state.profile_complete:
          return {}

  profile_complete es False → continúa.

  llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key="...")
  messages = [SystemMessage(content=_SYSTEM)] + state.messages
  response = llm.invoke(messages)

  Construye la lista de mensajes:
  - SystemMessage con las instrucciones (recolectar 6 campos, devolver JSON cuando los tenga)
  - El mensaje del usuario: "Hola, soy argentino, 24 años..."

  Gemini recibe eso y responde algo como: "¡Hola! Ya tengo que sos argentino. ¿Cuál es tu presupuesto mensual en USD?"

  data = extract_json(response.content)

  app/utils.py — extract_json(): Intenta parsear la respuesta como JSON. Gemini devolvió texto conversacional → json.loads() falla → los regex no encuentran ningún {...} → devuelve None.

  if isinstance(data, dict) and data.get("profile_complete"):
      # no entra acá porque data es None
      ...

  return {"messages": [response]}

  El nodo devuelve solo el mensaje de Gemini. LangGraph lo mergea al estado:
  - state.messages ahora tiene: [HumanMessage("Hola..."), AIMessage("¡Hola! Ya tengo...")]
  - profile_complete sigue en False

  ---
  Paso 6 — _after_profile decide qué sigue

  def _after_profile(state: NomadState) -> str:
      return "destination" if state.profile_complete else END

  profile_complete = False → devuelve END. LangGraph para la ejecución.

  MemorySaver guarda el estado completo indexado por thread_id.

  ---
  Paso 7 — Respuesta al browser

  De vuelta en main.py:
  last_message = result["messages"][-1]
  reply = last_message.content   # "¡Hola! Ya tengo que sos argentino..."

  final_report = None if had_report else result.get("final_report")
  # had_report=False, final_report=None → final_report=None

  return ChatResponse(session_id=session_id, reply=reply, final_report=None, profile_complete=False)

  El browser recibe la respuesta y muestra el mensaje de Gemini en el chat.

  ---
  Paso 8 — El usuario completa el perfil (segundo+ mensajes)

  Cada nuevo mensaje repite los pasos 3-7. En profile_node, state.messages ya tiene el historial completo (todos los turnos anteriores), así que Gemini tiene contexto de lo que ya se dijo.

  Cuando el usuario da el último dato faltante, Gemini detecta que tiene los 6 campos y responde solo con el JSON:
  {"profile_complete": true, "hobbies": ["poker", "networking"], "budget_usd_monthly": 2000, ...}

  extract_json() lo parsea exitosamente → data.get("profile_complete") es True → el nodo retorna:
  return {"user_profile": UserProfile(...), "profile_complete": True, "messages": [response]}

  LangGraph mergea esto al estado. Ahora state.profile_complete = True.

  _after_profile(state) devuelve "destination" → el pipeline arranca.

  ---
  Paso 9 — Pipeline de enriquecimiento

  LangGraph ejecuta los nodos en cadena sin parar (no va a END en el medio):

  destination_node — app/nodes/destination_node.py

  Toma state.user_profile completo, construye un prompt con todos los datos y le pide a Gemini 3 destinos en JSON. Gemini devuelve:
  [{"city": "Malta", "country": "...", "match_score": 95, ...}, ...]

  extract_json() parsea la lista → se crean 3 objetos Destination → retorna {"destinations": [d1, d2, d3]}.

  Ahora state.destinations tiene 3 destinos con media, visa y climate vacíos (default).

  media_node — app/nodes/media_node.py

  Para cada uno de los 3 destinos:
  - Llama a search_youtube_reviews(query) con tu YOUTUBE_API_KEY → devuelve URLs reales
  - Llama a search_web(query) con tu TAVILY_API_KEY → busca influencers

  Retorna {"destinations": [d1_con_media, d2_con_media, d3_con_media]} — LangGraph reemplaza la lista entera.

  climate_node — app/nodes/climate_node.py

  Para cada destino:
  1. Llama a get_climate_summary(city, country) — hace 2 requests HTTP a Open-Meteo (geocoding + datos climáticos de 30 años)
  2. Si best_months queda vacío → llama a Gemini como fallback
  3. Retorna los destinos con climate poblado

  visa_node — app/nodes/visa_node.py

  Para cada destino:
  1. search_web(f"visa requirements {nationality} {country}...") — Tavily busca info real
  2. Le pasa esos snippets a Gemini junto con destino y nacionalidad
  3. Gemini sintetiza el JSON de visa con datos reales

  compiler_node — app/nodes/compiler_node.py

  Tiene los 3 destinos completamente enriquecidos. _format_destination() convierte cada Destination en texto estructurado con YouTube links, meses de clima, info de visa, etc. Le pasa todo eso a Gemini con el system prompt de "generá un reporte bonito en markdown con
   emojis".

  Gemini devuelve el reporte final → el nodo retorna {"final_report": "# Tu próxima aventura..."}.

  ---
  Paso 10 — Respuesta con el reporte

  De vuelta en main.py:
  Paso 10 — Respuesta con el reporte

  De vuelta en main.py:
  De vuelta en main.py:
  had_report = False  # era False antes de este invoke
  final_report = None if had_report else result.get("final_report")
  # had_report=False → devuelve el final_report real

  El browser recibe final_report con el markdown completo y lo renderiza con marked.js.

  ---
  Paso 11 — Followup (preguntas post-reporte)

  El usuario manda: "¿Por qué no incluiste Buenos Aires?"

  En main.py:
  prev_state = graph.get_state(config)
  had_report = bool(prev_state.values.get("final_report"))
  # ahora final_report existe → had_report = True

  LangGraph carga el estado (que tiene final_report guardado), _entry_point devuelve "followup" → va directo a followup_node.

  followup_node toma solo el último mensaje del usuario (no todo el historial), arma el contexto con el perfil + reporte + destinos, y Gemini responde la pregunta puntual.


  De vuelta en main.py:
  final_report = None if had_report else result.get("final_report")
  # had_report=True → final_report=None → el browser muestra reply, no el reporte viejo

  ---
  2. Si best_months queda vacío → llama a Gemini como fallback
  3. Retorna los destinos con climate poblado

  visa_node — app/nodes/visa_node.py

  Para cada destino:
  1. search_web(f"visa requirements {nationality} {country}...") — Tavily busca info real
  2. Le pasa esos snippets a Gemini junto con destino y nacionalidad
  3. Gemini sintetiza el JSON de visa con datos reales

  compiler_node — app/nodes/compiler_node.py

  Tiene los 3 destinos completamente enriquecidos. _format_destination() convierte cada Destination en texto estructurado con YouTube links, 
  meses de clima, info de visa, etc. Le pasa todo eso a Gemini con el system prompt de "generá un reporte bonito en markdown con emojis".    

  Gemini devuelve el reporte final → el nodo retorna {"final_report": "# Tu próxima aventura..."}.

  ---
  Paso 10 — Respuesta con el reporte

  De vuelta en main.py:
  had_report = False  # era False antes de este invoke
  final_report = None if had_report else result.get("final_report")
  # had_report=False → devuelve el final_report real

  El browser recibe final_report con el markdown completo y lo renderiza con marked.js.

  ---
  Paso 11 — Followup (preguntas post-reporte)

  El usuario manda: "¿Por qué no incluiste Buenos Aires?"

  En main.py:
  prev_state = graph.get_state(config)
  had_report = bool(prev_state.values.get("final_report"))
  # ahora final_report existe → had_report = True

  LangGraph carga el estado (que tiene final_report guardado), _entry_point devuelve "followup" → va directo a followup_node.

  followup_node toma solo el último mensaje del usuario (no todo el historial), arma el contexto con el perfil + reporte + destinos, y Gemini
   responde la pregunta puntual.

  De vuelta en main.py:
  final_report = None if had_report else result.get("final_report")
  final_report = None if had_report else result.get("final_report")
  # had_report=False → devuelve el final_report real

  El browser recibe final_report con el markdown completo y lo renderiza con marked.js.

  ---
  final_report = None if had_report else result.get("final_report")
  # had_report=False → devuelve el final_report real

  El browser recibe final_report con el markdown completo y lo renderiza con marked.js.

  ---
  Paso 11 — Followup (preguntas post-reporte)

  De vuelta en main.py:
  had_report = False  # era False antes de este invoke
  final_report = None if had_report else result.get("final_report")
  # had_report=False → devuelve el final_report real

  El browser recibe final_report con el markdown completo y lo renderiza con marked.js.

  ---
  had_report = False  # era False antes de este invoke
  final_report = None if had_report else result.get("final_report")
  # had_report=False → devuelve el final_report real

  El browser recibe final_report con el markdown completo y lo renderiza con marked.js.

  final_report = None if had_report else result.get("final_report")
  # had_report=False → devuelve el final_report real

  El browser recibe final_report con el markdown completo y lo renderiza con marked.js.

  ---
  Ahora state.destinations tiene 3 destinos con media, visa y climate vacíos (default).

  media_node — app/nodes/media_node.py

  Para cada uno de los 3 destinos:
  - Llama a search_youtube_reviews(query) con tu YOUTUBE_API_KEY → devuelve URLs reales
  - Llama a search_web(query) con tu TAVILY_API_KEY → busca influencers

  Retorna {"destinations": [d1_con_media, d2_con_media, d3_con_media]} — LangGraph reemplaza la lista entera.

  climate_node — app/nodes/climate_node.py

  Para cada destino:
  1. Llama a get_climate_summary(city, country) — hace 2 requests HTTP a Open-Meteo (geocoding + datos climáticos de 30 años)
  2. Si best_months queda vacío → llama a Gemini como fallback
  3. Retorna los destinos con climate poblado

  visa_node — app/nodes/visa_node.py

  Para cada destino:
  1. search_web(f"visa requirements {nationality} {country}...") — Tavily busca info real
  2. Le pasa esos snippets a Gemini junto con destino y nacionalidad
  3. Gemini sintetiza el JSON de visa con datos reales

  compiler_node — app/nodes/compiler_node.py

  Tiene los 3 destinos completamente enriquecidos. _format_destination() convierte cada Destination en texto estructurado con YouTube links, meses de clima,
   info de visa, etc. Le pasa todo eso a Gemini con el system prompt de "generá un reporte bonito en markdown con emojis".

  Gemini devuelve el reporte final → el nodo retorna {"final_report": "# Tu próxima aventura..."}.

  ---
  Paso 10 — Respuesta con el reporte

  De vuelta en main.py:
  had_report = False  # era False antes de este invoke
  final_report = None if had_report else result.get("final_report")
  # had_report=False → devuelve el final_report real

  El browser recibe final_report con el markdown completo y lo renderiza con marked.js.

  ---
  Paso 11 — Followup (preguntas post-reporte)

  El usuario manda: "¿Por qué no incluiste Buenos Aires?"

  En main.py:
  prev_state = graph.get_state(config)
  had_report = bool(prev_state.values.get("final_report"))
  # ahora final_report existe → had_report = True

  LangGraph carga el estado (que tiene final_report guardado), _entry_point devuelve "followup" → va directo a followup_node.

  followup_node toma solo el último mensaje del usuario (no todo el historial), arma el contexto con el perfil + reporte + destinos, y Gemini responde la   
  pregunta puntual.

  De vuelta en main.py:
  final_report = None if had_report else result.get("final_report")
  # had_report=True → final_report=None → el browser muestra reply, no el reporte viejo

  ---
  Resumen visual de todo el flujo

  uvicorn arranca → graph se compila una vez
                           │
  Usuario POST /chat ──────┤
                           │
              main.py      │  LangGraph
           ┌───────────────▼──────────────────────────────────────┐
           │  get_state() → ¿existe estado previo?                 │
           │  invoke() →  _entry_point                             │
           │               ├─ final_report? → followup → END       │
           │               └─ no?          → profile               │
           │                                    │                  │
           │                             profile_complete?         │
           │                               ├─ no  → END            │
           │                               └─ sí  → destination    │
           │                                           → media      │
           │                                           → climate    │
           │                                           → visa       │
           │                                           → compiler   │
           │                                           → END        │
           │  MemorySaver guarda estado por thread_id               │
           └──────────────────────────────────────────────────────┘
                           │
              ChatResponse al browser