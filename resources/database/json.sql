SELECT json_object(
	'version', 2,
	'entries', json_group_array(
		json_object(
			'type', type,
			'content', content,
			'pinned', pinned,
			'tag', tag,
			'datetime', strftime('%FT%T.000000Z', datetime, 'utc'),
			'metadata', metadata
		)
  	)
) FROM clipboard;
