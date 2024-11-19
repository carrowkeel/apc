import { range, round, mean, mathNotation, shortNotation } from '/apc/common.js';

const color_cycle = [
	[31,119,180],
	[255,127,14],
	[44,160,44],
	[214,39,40],
	[148,103,189],
	[140,86,75],
	[227,119,194],
	[127,127,127],
	[188,189,34],
	[23,190,207],
	[60,119,180],
	[255,167,14],
	[44,160,74],
	[244,39,40],
	[148,143,189],
	[140,86,115],
	[255,119,194],
	[127,170,127],
	[188,189,70],
	[70,190,207]
];

export const createSVG = (container, bounds = [[0, 1], [0, 1]], ratio=1) => {
	const w = Math.floor(container.getBoundingClientRect().width) - 1;
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', w);
	svg.setAttribute('height', w*ratio);
	svg.setAttribute('viewBox', `0 0 ${w} ${w*ratio}`);
	svg.dataset.width = w;
	svg.dataset.height = w*ratio;
	container.appendChild(svg);
	return svg_draw(svg, bounds);
};

export const createCanvas = (container, bounds=[[0, 1], [0, 1]], ratio=1) => {
	const w = Math.floor(container.getBoundingClientRect().width) - 1;
	const canvas = document.createElement('canvas');
	canvas.setAttribute('width', w);
	canvas.setAttribute('height', w*ratio);
	canvas.dataset.width = w;
	canvas.dataset.height = w*ratio;
	container.appendChild(canvas);
	const ctx = canvas.getContext('2d');
	return canvas_draw(canvas, ctx, bounds);
};

export const initializePlots = (container, plots) => {
	plots.forEach(plot => {
		if (draw_plot[plot.type] === undefined)
			throw `The plot type ${plot.type} is not defined`;
		const plot_elem = document.createElement('div');
		plot_elem.classList.add('plot');
		plot_elem.dataset.save = plot.save || 'dynamics';
		plot_elem.dataset.plot = plot.label;
		plot_elem.dataset.plotType = plot.type;
		const legend = (plot.legend !== undefined ? plot.legend : plot.y || plot.data || '').split(',').filter(entry => entry !== '').map(legend_entry => `<a>${mathNotation(legend_entry)}</a>`).join('');
		plot_elem.innerHTML = `<div class="crosshair"></div><div class="header"><a data-icon="e" data-action="export" class="settings fright"></a><div class="title">${plot.label || 'dynamics'}</div></div><div class="legend">${legend}</div><div class="draw_area"><div class="axis-label label-x">${mathNotation(plot.xlabel || 'x')}</div><div class="axis-label label-y">${mathNotation(plot.ylabel || 'y')}</div><div class="axis-tick xmin">${shortNotation(plot.xlim[0])}</div><div class="axis-tick ymin">${shortNotation(plot.ylim[0])}</div><div class="axis-tick xmax">${shortNotation(plot.xlim[1])}</div><div class="axis-tick ymax">${shortNotation(plot.ylim[1])}</div></div></div>`;
		container.appendChild(plot_elem);
		if (plot.type !== 'image')
			createCanvas(plot_elem.querySelector('.draw_area'));
	});
};

export const updatePlots = (container, plots, data, update_axis=false) => {
	plots.forEach(plot => {
		const plot_elem = container.querySelector(`[data-plot="${plot.label}"]`);
		if (!plot_elem)
			return;
		if (draw_plot[plot.type] === undefined)
			throw `The plot type ${plot.type} is not defined`;
		if (plot.type === 'image') {
			data.forEach(image_uri => {
				const img = document.createElement('img');
				img.setAttribute('src', image_uri)
				plot_elem.querySelector('.draw_area').appendChild(img);
			});
			return;
		}
		const canvas = plot_elem.querySelector('canvas');
		const draw_elem = canvas_draw(canvas, canvas.getContext('2d'), [plot.xlim, plot.ylim]);
		if (update_axis === true) {
			plot_elem.querySelector('.xmin').innerText = shortNotation(plot.xlim[0]);
			plot_elem.querySelector('.xmax').innerText = shortNotation(plot.xlim[1]);
			plot_elem.querySelector('.ymin').innerText = shortNotation(plot.ylim[0]);
			plot_elem.querySelector('.ymax').innerText = shortNotation(plot.ylim[1]);
			draw_elem.clear();
		}
		switch(true) {
			case plot.y !== undefined:
				plot.y.split(',').forEach((y, i) => {
					const x = plot.x.split(',').length === 1 ? plot.x : plot.x.split(',')[i];
					if (data[0][x] === undefined)
						throw `Failed to draw plot ${plot.label}: x-axis parameter ${x} not found in model output`;
					if (data[0][y] === undefined)
						throw `Failed to draw plot ${plot.label}: y-axis parameter ${y} not found in model output`;
					const plot_data = data.map(data_point => [x, y].map(prop => data_point[prop]));
					draw_plot[plot.type](draw_elem, plot_data, i);
				});
				break;
			case plot.data !== undefined:
				draw_elem.clear();
				plot.data.split(',').forEach((data_parameter, i) => {
					if (data[data.length - 1][data_parameter] === undefined)
						throw `Failed to draw plot ${plot.label}: data parameter ${data_parameter} not found in model output`;
					const plot_data = data[data.length - 1][data_parameter];
					draw_plot[plot.type](draw_elem, plot_data, i);
				});
				break;
			case plot.function !== undefined:
				draw_plot[plot.type](draw_elem, data);
				break;
			default:
				throw `Failed to draw plot ${plot.label}: plot input not defined in scheme (use 'data' or 'y' to define the input of the plot)`;
		}
	});
};

export const draw_plot = {
	scatter: (draw, points, i, r=5, opacity=0.5) => {
		points.forEach(point => draw.point(point, color_cycle[i], r, point[2] !== undefined ? point[2] : opacity));
	},
	line: (draw, line, i) => {
		draw.line_x(line, color_cycle[i]);
	},
	lines: (draw, lines, i) => {
		const lines_mean = lines.map(([x, line_y]) => [x, mean(line_y)]);
		const lines_rep = range(0, lines[0][1].length).map(i => lines.map(([x, line_y]) => [x, line_y[i]]));
		draw.line_x(lines_mean, color_cycle[i]);
		lines_rep.map(line => draw.line_x(line, color_cycle[i], 0.2));
	},
	grayscale_2d: (draw, data, i) => {
		draw.pre();
		data.forEach((row, y) => row.forEach((cell, x) => {
			const color = [255 * cell, 255 * cell, 255 * cell];
			draw.normed_rect([x / data[0].length, (data.length - y - 1) / data.length, 1 / data[0].length, 1 / data.length], color);
		}));
		draw.post();
	},
	mat: (draw, data, i) => {
		draw.pre();
		data.forEach((row, y) => row.forEach((cell_value, x) => {
			const color = Array.isArray(cell_value) ? cell_value : (typeof cell_value === 'number' ? range(0, 3).map(rgb_i => color_cycle[i][rgb_i] + (color_cycle[i + 1][rgb_i] - color_cycle[i][rgb_i]) * cell_value) : [200, 200, 200]);
			draw.normed_rect([x / data[0].length, (data.length - y - 1) / data.length, 1 / data[0].length, 1 / data.length], color);
		}));
		draw.post();
	},
	mat_grayscale: (draw, data, i) => {
		draw.pre();
		data.forEach((row, y) => row.forEach((cell_value, x) => {
			const color = Array.isArray(cell_value) ? cell_value : (typeof cell_value === 'number' ? [255 * cell_value, 255 * cell_value, 255 * cell_value] : [200, 200, 200]);
			draw.normed_rect([x / data[0].length, (data.length - y - 1) / data.length, 1 / data[0].length, 1 / data.length], color);
		}));
		draw.post();
	},
	grid: (draw, data, i) => {
		draw.pre();
		data.forEach(([x, y, cell_value]) => {
			const color = Array.isArray(cell_value) ? cell_value : (typeof cell_value === 'number' ? range(0, 3).map(rgb_i => color_cycle[i][rgb_i] + (color_cycle[i + 1][rgb_i] - color_cycle[i][rgb_i]) * cell_value) : [200, 200, 200]);
			draw.scaled_rect([x, y, 1, 1], color);
		});
		draw.post();
	},
	network_plot: (draw, data, i) => {
		draw.clear();
		const [nodes, edges] = data;
		for (const edge of edges)
			draw.line_x(edge, color_cycle[i]);
		for (const node of nodes) {
			const color = range(0, 3).map(rgb_i => color_cycle[i][rgb_i] + (color_cycle[i + 1][rgb_i] - color_cycle[i][rgb_i]) * node[2]);
			draw.point(node.slice(0, 2), color);
		}
	},
	image: (draw, data, i) => {
	},
};

export const svg_draw = (svg, bounds=[[0, 1], [0, 1]], dims=[svg.dataset.width, svg.dataset.height].map(v=>+(v)), scale=bounds.map((v,i)=>dims[i]/(v[1]-v[0]))) => ({
	elem: svg,
	dims,
	bounds,
	pre: () => {},
	post: () => {},
	clear: function (query = '*') {
		svg.querySelectorAll(query).forEach(item => svg.removeChild(item));
	},
	filled_line: function (line, prev, offset=0) {
		const current = prev.slice();
		line.forEach(v=>current[v[0]]+=v[1]);
		this.polygon(prev.map((y,x)=>[offset+x, y])
			.concat(current.slice().reverse().map((y,x)=>[(offset+current.length-1-x), y])), line[0][2], 0.5, 'proportion');
		return current;
	},
	line_x: function (line, color, opacity=1) {
		this.polyline(line.map(([x,y])=>[(x-bounds[0][0])*scale[0], (bounds[1][1]-y)*scale[1]]), color, opacity, 'dynamic', {'data-value': line.map(v => v.map(v => round(v, 10)).join(';')).join(',')});
	},
	line: function (line, color, dynamic=true, offset=0, opacity=1) {
		this.polyline(line.map((y,x)=>[(offset+x-bounds[0][0])*scale[0], (bounds[1][1]-y)*scale[1]]), color, opacity, dynamic ? 'dynamic' : '', {'data-value': line.map(v => round(v, 10)).join(',')});
	},
	normed_rect: function (s, color, opacity=1) {
		const [x, y] = [s[0] * dims[0], s[1] * dims[1]];
		const rect = [
			x,
			y,
			dims[0] * s[2],
			dims[1] * s[3]
		].map(v => round(v, 4));
		this.rect(...rect, color, opacity);
	},
	scaled_rect: function (s, color, opacity=1) {
		const [x, y] = [scale[0] * (s[0] - bounds[0][0]), scale[1] * (bounds[1][1]-s[1]-s[3])];
		const rect = [
			x,
			y,
			scale[0] * s[2],
			scale[1] * s[3]
		].map(v => round(v, 4));
		this.rect(...rect, color, opacity);
	},
	point: function ([x, y], color, r=2, opacity=1) {
		this.circle((x-bounds[0][0])*scale[0], (bounds[1][1]-y)*scale[1], r, color, opacity, 'dynamic')
	},
	element: function (type, props) {
		const element = document.createElementNS('http://www.w3.org/2000/svg', type);
		for (const prop in props)
			element.setAttribute(prop, props[prop]);
		svg.appendChild(element);
		return element;
	},
	arrow: function (points, stroke=[255, 120, 0], opacity=0.5, classname='') {
		this.polyline(points, stroke, 1, classname);
	},
	rect: function (x, y, width, height, fill=[0, 0, 0], opacity=1, props={}, classname='') {
		this.element('rect', {x, y, width, height, fill: `rgb(${fill.join(',')})`, opacity, class: classname, ...props});
	},
	circle: function (x, y, r=3, fill=[0, 0, 0], opacity=1, classname='') {
		this.element('circle', {cx: x, cy: y, r, fill: `rgb(${fill.join(',')})`, opacity, class: classname});
	},
	polyline: function (points, stroke=[0, 0, 0], opacity=1, classname='', props={}) {
 		this.element('polyline', {points: points.map(v=>v.map(v=>round(v,3)).join(',')).join(' '), fill: 'none', stroke: `rgb(${stroke.join(',')})`, opacity, 'class': classname, ...props});
	},
	polygon: function (points, fill=[0, 0, 0], opacity=1, classname='', info='', transform='') {
		this.element('polygon', {points: points.map(([x,y])=>[(x-bounds[0][0])*scale[0], (bounds[1][1]-y)*scale[1]].join(',')).join(' '), fill: `rgb(${fill.join(',')})`, opacity, 'class': classname, transform, 'data-info': info});
	},
	text: function (text, x, y, classname='', transform='') {
		const elem = this.element('text', {x, y, 'class': classname, transform});
		elem.textContent = text;
	},
	image: function (href, width, height, classname='') {
		const elem = this.element('image', {href, width, height, 'class': classname});
	},
	grid: function (gridres=40) {
		const xres = dims[0] / Math.floor(dims[0] / gridres);
		const yres = dims[1] / Math.floor(dims[1] / gridres);
		for (let x=xres;x<dims[0];x+=xres)
			this.rect(Math.round(x), 0, 1, dims[1], undefined, 0.1);
		for (let y=yres;y<dims[1];y+=yres)
			this.rect(0, Math.round(y), dims[0], 1, undefined, 0.1);
	}
});

export const canvas_draw = (canvas, ctx, bounds=[[0, 1], [0, 1]], dims=[canvas.dataset.width, canvas.dataset.height].map(v=>+(v)), scale=bounds.map((v,i)=>dims[i]/(v[1]-v[0]))) => ({
	elem: canvas,
	pre: () => {
		ctx.translate(0.5, 0.5);
	},
	post: () => {
		ctx.translate(-0.5, -0.5);
	},
	clear: function () {
		ctx.clearRect(0, 0, ...dims);
	},
	filled_line: function (line, prev, offset) {
		const current = prev.slice();
		line.forEach(v=>current[v[0]]+=v[1]);
		this.polygon(prev.map((y,x)=>[(offset+x-bounds[0][0])*scale[0], (bounds[1][1]-y)*scale[1]])
			.concat(current.slice().reverse().map((y,x)=>[(offset+current.length-1-x)*scale[0], (bounds[1][1]-y)*scale[1]])), line[0][2], 0.5);
		return current;
	},
	line_x: function (line, color, opacity=1) {
		this.polyline(line.map(([x,y])=>[(x-bounds[0][0])*scale[0], (bounds[1][1]-y)*scale[1]]), color, opacity);
	},
	line: function (line, color, dynamic=false, offset=0, opacity=1) {
		if (line[0].length === 2)
			this.polyline(line.map(([x,y])=>[(x-bounds[0][0])*scale[0], (bounds[1][1]-y)*scale[1]]), color, opacity);
		else
			this.polyline(line.map((y,x)=>[(offset+x-bounds[0][0])*scale[0], (bounds[1][1]-y)*scale[1]]), color, opacity);
	},
	normed_rect: function (s, color, opacity=1) {
		const [x, y] = [s[0] * dims[0], s[1] * dims[1]];
		const rect = [
			x,
			y,
			dims[0] * s[2],
			dims[1] * s[3]
		].map(v => round(v, 4));
		this.rect(...rect, color, opacity);
	},
	scaled_rect: function (s, color, opacity=1, stroke=true) {
		const [x, y] = [scale[0] * (s[0] - bounds[0][0]), scale[1] * (bounds[1][1]-s[1]-s[3])];
		const rect = [
			x,
			y,
			scale[0] * s[2],
			scale[1] * s[3]
		].map(Math.round);
		this.rect(...rect, color, opacity, stroke);
	},
	point: function ([x, y], color, r=4, opacity) {
		this.circle((x-bounds[0][0])*scale[0], (bounds[1][1]-y)*scale[1], r, color, opacity)
	},
	rect: function (x, y, width, height, fill=[0, 0, 0], opacity=1, stroke=false) {
		ctx.fillStyle = `rgba(${fill.join(',')},${opacity})`;
		ctx.fillRect(x, y, width, height);
		if (stroke) {
			ctx.strokeStyle = `rgba(${fill.join(',')},${opacity/1})`;
			ctx.strokeRect(x, y, width, height);
		}
	},
	circle: function (x, y, r = 3, fill = [0, 0, 0], opacity = 1) {
		ctx.beginPath();
		ctx.arc(x, y, r, 0, 2 * Math.PI);
		ctx.fillStyle = `rgba(${fill.join(',')},${opacity})`;
		ctx.fill();
		ctx.closePath();
	},
	polyline: function (points, stroke=[0, 0, 0], opacity=1, classname='', info='') {
		ctx.beginPath();
		ctx.moveTo(points[0][0], points[0][1]);
		points.slice(1).forEach(v => ctx.lineTo(v[0], v[1]));
		ctx.strokeStyle = `rgba(${stroke.join(',')},${opacity})`;
		ctx.stroke();
		ctx.closePath();
	},
	polygon: function (points, fill=[0, 0, 0], opacity=1, classname='', info='', transform='') {
		ctx.beginPath();
		ctx.moveTo(points[0][0], points[0][1]);
		points.slice(1).forEach(v => ctx.lineTo(v[0], v[1]));
		ctx.fillStyle = `rgba(${fill.join(',')},${opacity})`;
		ctx.fill();
		ctx.closePath();
	},
	text: function (text, x, y, rotate=0) {
		ctx.fillStyle = 'rgb(0,0,0)';
		ctx.style = 'font-size:16px';
		if (rotate !== 0) {
			ctx.save();
			ctx.rotate((Math.PI / 180) * rotate);
			ctx.fillText(text, x, y);
			ctx.restore();
		} else {
			ctx.fillText(text, x, y);
		}
	},
	grid: function (gridres=40) {
		const xres = dims[0] / Math.floor(dims[0] / gridres);
		const yres = dims[1] / Math.floor(dims[1] / gridres);
		for (let x=xres;x<dims[0];x+=xres)
			this.rect(Math.round(x), 0, 1, dims[1], undefined, 0.1);
		for (let y=yres;y<dims[1];y+=yres)
			this.rect(0, Math.round(y), dims[0], 1, undefined, 0.1);
	}
});

