import gulp from 'gulp';
import {basename} from 'path';
import {prefixDev, prefixDist} from './helper/utils';
import gulpLoadPlugins from 'gulp-load-plugins';
const $ = gulpLoadPlugins();

export const twig = () =>
    gulp.src(prefixDev('../views/controller/**/*.twig'))
        .pipe($.newer('.tmp/html'))
        .pipe($.twig({
            base: prefixDev('../views'),
            functions: [{
                name: 'asset',
                func: args => args
            }],
            namespaces: {web: prefixDist('/')}
        }))
        .pipe($.rename(path => {
            path.basename = basename(path.basename, '.html');
        }))
        .pipe(gulp.dest('.tmp/html'))
        .pipe($.size({title: 'twig'}));
