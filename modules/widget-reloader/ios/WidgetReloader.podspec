Pod::Spec.new do |s|
  s.name           = 'WidgetReloader'
  s.version        = '1.0.0'
  s.summary        = 'Asks iOS to refresh the home and lock screen widgets.'
  s.description    = 'Local Expo module: lets JS call WidgetCenter.reloadAllTimelines after the cloud copy is updated.'
  s.license        = 'MIT'
  s.author         = 'Pocket Guardian'
  s.homepage       = 'https://github.com/mrhaibaoseal-lang/pocket-guardian'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.frameworks     = 'WidgetKit'

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
