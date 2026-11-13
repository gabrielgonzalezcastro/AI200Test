import json,sys
d=json.load(open('site/data/questions.json',encoding='utf-8'))
lo,hi=int(sys.argv[1]),int(sys.argv[2])
for q in d['questions']:
    if not(lo<=q['id']<=hi): continue
    st=' '.join(q['text']).replace('To answer, select the appropriate options in the answer area.','').replace('NOTE: Each correct selection is worth one point.','')
    print(f"#{q['id']} [{q['kind']}] {'(case) ' if q['case'] else ''}{st[:650]}")
    if q['kind'] in('single','multi'): print('   OPTS: '+' | '.join(f"{o['key']}) {o['text'][:160]}" for o in q['options'])+f"  => {''.join(q['answer'])}")
