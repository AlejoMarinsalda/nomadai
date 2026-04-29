from langgraph.graph import StateGraph, END
from langgraph_checkpoint_aws import DynamoDBSaver

from app.graph.state import NomadState
from app.nodes.profile_node import profile_node
from app.nodes.destination_node import destination_node
from app.nodes.enrichment_node import enrichment_node
from app.nodes.compiler_node import compiler_node
from app.nodes.followup_node import followup_node


def _entry_point(state: NomadState) -> str:
    # final_report es un string plano, serializa/deserializa correctamente en MemorySaver
    # destinations (lista de Pydantic anidados) puede vaciarse en deserialización
    if state.final_report:
        return "followup"
    return "profile"


def _after_profile(state: NomadState) -> str:
    # Si el perfil está completo → disparar pipeline, si no → esperar siguiente mensaje
    return "destination" if state.profile_complete else END


def build_graph() -> StateGraph:
    builder = StateGraph(NomadState)

    builder.add_node("profile", profile_node)
    builder.add_node("destination", destination_node)
    builder.add_node("enrichment", enrichment_node)
    builder.add_node("compiler", compiler_node)
    builder.add_node("followup", followup_node)

    builder.set_conditional_entry_point(
        _entry_point,
        {"profile": "profile", "followup": "followup"},
    )

    builder.add_conditional_edges("profile", _after_profile, {"destination": "destination", END: END})

    builder.add_edge("destination", "enrichment")
    builder.add_edge("enrichment", "compiler")
    builder.add_edge("compiler", END)

    # Followup termina el turno y espera el próximo mensaje
    builder.add_edge("followup", END)

    checkpointer = DynamoDBSaver(
        table_name="nomadai-checkpoints",
        region_name="us-east-1",
        ttl_seconds=86400 * 30,
        s3_offload_config={
            "bucket_name": "nomadai-checkpoints-offload",
            "key_prefix": "checkpoints",
        },
    )
    return builder.compile(checkpointer=checkpointer)


graph = build_graph()
