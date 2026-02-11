$xelatex = 'xelatex -interaction=nonstopmode -synctex=1 %O %S';
$pdf_mode = 5;                    # use xelatex
$biber = 'biber %O %S';
$makeglossaries = 'makeglossaries %O %S';
push @generated_exts, 'glo', 'gls', 'glg';
push @generated_exts, 'acn', 'acr', 'alg';
push @generated_exts, 'ist', 'sbl', 'sym';
push @generated_exts, 'app';
add_cus_dep('glo', 'gls', 0, 'run_makeglossaries');
add_cus_dep('acn', 'acr', 0, 'run_makeglossaries');
add_cus_dep('sbl', 'sym', 0, 'run_makeglossaries');
sub run_makeglossaries {
    my ($base_name, $path) = fileparse( $_[0] );
    pushd $path;
    my $return = system "makeglossaries", $base_name;
    popd;
    return $return;
}
