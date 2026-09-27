#!/usr/bin/env python3
# LLMLingua-2 on code context. The useful question is not "how much smaller" but "do the facts a
# code question needs (identifiers, signatures) survive lossy token compression". Compress one
# real file at several rates and report the token reduction next to which facts are still there.
#
#   pip install llmlingua
#   python3 tools/llmlingua.py [FILE] [FACT ...]
#
# Defaults to the users router of the FastAPI template from bench/questions.json.
import os
import sys
import time

from llmlingua import PromptCompressor

DEFAULT_FILE = os.path.expanduser(
    "~/cbm-bench/repos/full-stack-fastapi-template/backend/app/api/routes/users.py")
DEFAULT_FACTS = ["def create_user", "def read_users", "crud.create_user", "HTTPException", "UserCreate"]

path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_FILE
facts = sys.argv[2:] or DEFAULT_FACTS
text = open(path).read()

t0 = time.time()
compressor = PromptCompressor(
    model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
    use_llmlingua2=True,
    device_map="cpu",
)
print(f"model load {time.time() - t0:.1f}s; file {path} ({len(text)} chars)")

for rate in (0.7, 0.5, 0.33):
    t0 = time.time()
    r = compressor.compress_prompt(text, rate=rate, force_tokens=["\n", ".", "(", ")", ":", "_"])
    kept = [f for f in facts if f in r["compressed_prompt"]]
    print(f"rate {rate}: {r['origin_tokens']} -> {r['compressed_tokens']} tokens "
          f"({time.time() - t0:.1f}s), facts kept {len(kept)}/{len(facts)}: missing {sorted(set(facts) - set(kept))}")
