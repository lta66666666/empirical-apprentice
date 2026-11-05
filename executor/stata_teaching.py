"""Read-only manifest extracted from the exact script that will be approved."""
TEMPLATE_VERSION = 'stata18-core-v1'

def command_topic(line):
    for prefix, topic in (
        ('import delimited ', 'import'), ('destring ', 'numeric'),
        ('drop if ea_missing', 'missing'), ('assert _N', 'sample'),
        ('egen long ea_cluster', 'cluster'), ('egen long ea_panel', 'panel'),
        ('xtset ', 'xtset'), ('generate byte policy_post', 'post'),
        ('generate byte policy_effect', 'interaction'),
        ('regress ', 'estimate'), ('xtreg ', 'estimate')):
        if line.startswith(prefix): return topic
    return None

def teaching_manifest(code, plan, columns):
    commands = []
    for number, line in enumerate(code.splitlines(), 1):
        topic = command_topic(line)
        if topic:
            commands.append({'id': f'line-{number}', 'line': number, 'text': line, 'topic': topic})
    derived = []
    if plan['vcov'] == 'cluster':
        derived.append({'alias': 'ea_cluster', 'role': 'cluster', 'sources': [plan['cluster']]})
    if plan['method'] != 'ols':
        derived.append({'alias': 'ea_panel', 'role': 'panel', 'sources': [plan['unit']]})
    if plan['method'] == 'did':
        derived += [{'alias': 'policy_post', 'role': 'post', 'sources': [plan['time']]},
                    {'alias': 'policy_effect', 'role': 'interaction', 'sources': [plan['treated'], 'policy_post']}]
    return {'schema_version': 1, 'template_version': TEMPLATE_VERSION, 'commands': commands,
            'mapping': [{'alias': f'v{i}', 'name': c['name']} for i, c in enumerate(columns)], 'derived': derived}
