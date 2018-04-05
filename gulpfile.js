"use strict";
const gulp = require('gulp');
const ts = require('gulp-typescript');
const sourcemaps = require('gulp-sourcemaps');

const tsProject = ts.createProject('./tsconfig.json', {
    declaration: true
});


gulp.task('build', ()=>{
    gulp.src('./src/**/*.ts')
        .pipe(sourcemaps.init())
        .pipe(tsProject())
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('./dist'));
});

gulp.task('watch', ['build'], ()=>{
    gulp.watch('./src/**/*.ts', ['build']);
});

